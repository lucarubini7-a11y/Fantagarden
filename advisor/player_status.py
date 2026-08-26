"""Optional live player status (injured / suspended / doubtful) for Serie A.

Two providers are supported, both queried per-team (20 calls total for the
whole of Serie A, never per-player): Highlightly (primary) and API-Football /
api-sports.io (fallback, only used after confirming injury coverage for the
requested league/season via `coverage.injuries` on `GET /leagues`).

Coverage for the 2026/27 season could not be confirmed against live provider
docs in this environment (outbound network to highlightly.net and
api-sports.io is blocked here) - the endpoint paths and response field names
in `_fetch_highlightly` / `_fetch_api_football` are written from each
provider's publicly documented shape and should be checked against current
docs before relying on this against a real key. Nothing else in this module
depends on those details being exactly right: a wrong field name just means
a provider's players quietly get no status instead of breaking anything, and
`_api_football_covers_injuries` refuses to ever call `/injuries` for a
league/season it hasn't confirmed is covered.

The public API never raises. A missing key, an uncovered league, a request
failure, or a malformed response all degrade to an empty dict with a logged
warning - the auction tool behaves exactly as before when this isn't set up.
"""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

STATUS_VALUES = {"disponibile", "infortunato", "diffidato", "in_dubbio", "sconosciuto"}
CACHE_TTL_SECONDS = 6 * 60 * 60
SERIE_A_LEAGUE_ID = 135  # api-sports.io's Serie A league id
DEFAULT_CACHE_PATH = Path("data/processed/player_status_cache.json")


def _status_from_reason(reason: str | None) -> str:
    text = (reason or "").lower()
    if "suspend" in text or "squalific" in text or "ban" in text:
        return "diffidato"
    if "doubt" in text or "dubbio" in text or "question" in text:
        return "in_dubbio"
    if text:
        return "infortunato"
    return "sconosciuto"


class _RequestsClient:
    """Default HTTP client, imported lazily so tests never need `requests` installed to inject a fake."""

    def get(self, url: str, *, params: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> Any:
        import requests

        return requests.get(url, params=params, headers=headers, timeout=8)


def _fetch_highlightly(team_names: list[str], *, client: Any, api_key: str) -> dict[str, dict]:
    """Best-effort adapter for Highlightly's football injuries endpoint (see module docstring)."""
    headers = {"x-api-key": api_key}
    result: dict[str, dict] = {}
    for team_name in team_names:
        response = client.get(
            "https://football.highlightly.net/injuries",
            params={"team": team_name},
            headers=headers,
        )
        if getattr(response, "status_code", 200) >= 400:
            continue
        body = response.json() or {}
        for entry in body.get("data", body.get("response", [])) or []:
            name = entry.get("player_name") or entry.get("name")
            if not name:
                continue
            reason = entry.get("reason") or entry.get("type") or entry.get("description")
            result[name] = {
                "nome": name,
                "squadra": team_name,
                "stato": _status_from_reason(reason),
                "dettaglio": reason,
                "fonte": "highlightly",
                "ultimo_aggiornamento": entry.get("updated_at") or entry.get("date"),
            }
    return result


def _api_football_covers_injuries(client: Any, api_key: str, season: int) -> bool:
    """Checks coverage.injuries for Serie A/season before ever calling /injuries for it."""
    headers = {"x-apisports-key": api_key}
    response = client.get(
        "https://v3.football.api-sports.io/leagues",
        params={"id": SERIE_A_LEAGUE_ID, "season": season},
        headers=headers,
    )
    if getattr(response, "status_code", 200) >= 400:
        return False
    payload = response.json() or {}
    for league in payload.get("response", []) or []:
        for season_entry in league.get("seasons", []) or []:
            if season_entry.get("year") == season:
                return bool((season_entry.get("coverage") or {}).get("injuries"))
    return False


def _fetch_api_football(
    team_names: list[str],
    *,
    client: Any,
    api_key: str,
    season: int,
    team_ids: dict[str, int],
) -> dict[str, dict]:
    """Best-effort adapter for api-sports.io's /injuries (see module docstring)."""
    if not _api_football_covers_injuries(client, api_key, season):
        logger.warning("api-football: Serie A season %s has no confirmed injuries coverage; skipping.", season)
        return {}
    headers = {"x-apisports-key": api_key}
    result: dict[str, dict] = {}
    for team_name in team_names:
        team_id = team_ids.get(team_name)
        if team_id is None:
            continue
        response = client.get(
            "https://v3.football.api-sports.io/injuries",
            params={"league": SERIE_A_LEAGUE_ID, "season": season, "team": team_id},
            headers=headers,
        )
        if getattr(response, "status_code", 200) >= 400:
            continue
        for entry in (response.json() or {}).get("response", []) or []:
            player = entry.get("player") or {}
            name = player.get("name")
            if not name:
                continue
            reason = player.get("reason") or player.get("type")
            result[name] = {
                "nome": name,
                "squadra": team_name,
                "stato": _status_from_reason(reason),
                "dettaglio": reason,
                "fonte": "api-football",
                "ultimo_aggiornamento": None,
            }
    return result


def fetch_player_status(
    team_names: list[str],
    *,
    client: Any = None,
    provider: str = "highlightly",
    season: int = 2026,
    team_ids: dict[str, int] | None = None,
) -> dict[str, dict]:
    """Returns {player_name: {nome, squadra, stato, dettaglio, fonte, ultimo_aggiornamento}}.

    Never raises: a missing key, an unknown provider, an uncovered league, or
    any request failure all return an empty dict.
    """
    resolved_client = client if client is not None else _RequestsClient()
    if provider == "highlightly":
        api_key = os.environ.get("HIGHLIGHTLY_API_KEY")
        if not api_key:
            return {}
        try:
            return _fetch_highlightly(team_names, client=resolved_client, api_key=api_key)
        except Exception as error:  # noqa: BLE001 - must degrade, never raise
            logger.warning("Highlightly player status fetch failed: %s", error)
            return {}
    if provider == "api-football":
        api_key = os.environ.get("API_FOOTBALL_API_KEY")
        if not api_key:
            return {}
        try:
            return _fetch_api_football(
                team_names, client=resolved_client, api_key=api_key, season=season, team_ids=team_ids or {},
            )
        except Exception as error:  # noqa: BLE001 - must degrade, never raise
            logger.warning("API-Football player status fetch failed: %s", error)
            return {}
    logger.warning("Unknown player status provider: %r", provider)
    return {}


def _load_cache(path: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(payload, dict) or "fetched_at" not in payload or "players" not in payload:
        return None
    return payload


def _save_cache(path: Path, payload: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except OSError as error:
        logger.warning("Could not write player status cache %s: %s", path, error)


def fetch_player_status_with_fallback(team_names: list[str], **kwargs: Any) -> dict[str, dict]:
    """Tries Highlightly first, then falls back to API-Football if it returned nothing."""
    result = fetch_player_status(team_names, provider="highlightly", **kwargs)
    return result or fetch_player_status(team_names, provider="api-football", **kwargs)


def get_player_status(
    team_names: list[str],
    *,
    cache_path: Path = DEFAULT_CACHE_PATH,
    now: float | None = None,
    force_refresh: bool = False,
    fetch_fn: Any = None,
    **fetch_kwargs: Any,
) -> dict[str, Any]:
    """Returns {"fetched_at": <epoch seconds>, "players": {...}}.

    Reuses the on-disk cache when younger than CACHE_TTL_SECONDS, unless
    force_refresh is set. `now` is injectable so tests never need to sleep
    or monkeypatch time.time. `fetch_fn` defaults to
    `fetch_player_status_with_fallback` (Highlightly, then API-Football);
    pass an explicit `provider` in `fetch_kwargs`, or your own `fetch_fn`,
    to pin a single provider.
    """
    current_time = now if now is not None else time.time()
    cached = None if force_refresh else _load_cache(cache_path)
    if cached is not None and current_time - cached["fetched_at"] < CACHE_TTL_SECONDS:
        return cached
    fetch = fetch_fn if fetch_fn is not None else fetch_player_status_with_fallback
    players = fetch(team_names, **fetch_kwargs)
    payload = {"fetched_at": current_time, "players": players}
    _save_cache(cache_path, payload)
    return payload
