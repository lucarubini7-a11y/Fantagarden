"""Optional AI advisor: a short natural-language judgement from Claude for the
currently nominated player.

This is purely additive on top of the numeric advice already computed locally by
the browser Web Worker (see web/src/simulation.worker.js). That advice must stay
available offline and without any API key; this module only adds an optional
extra opinion on top of it, and degrades to "unavailable" without raising
whenever a key, network, or the API itself is not there.
"""
from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-sonnet-4-6"
TIMEOUT_SECONDS = 8.0
MAX_TOKENS = 200


def _text_field(value: Any) -> Any:
    return value if value not in (None, "") else "n/d"


def _build_evaluate_candidate_prompt(context: dict[str, Any]) -> str:
    player = context.get("player") or {}
    my_team = context.get("my_team") or {}
    other_teams = context.get("other_teams") or []
    alternatives = context.get("top_alternative_players") or []
    current_bid = context.get("current_bid")

    lines = [
        "Sei un consulente esperto di aste del Fantacalcio. Dai un giudizio netto e breve.",
        "",
        f"Giocatore in asta: {_text_field(player.get('nome'))} "
        f"({_text_field(player.get('ruolo'))}, {_text_field(player.get('squadra'))})",
        f"FVM: {_text_field(player.get('fvm'))} · "
        f"Prezzo massimo consigliato dal modello: {_text_field(player.get('prezzo_max_consigliato'))}",
    ]
    if current_bid is not None:
        lines.append(f"Offerta attuale: {current_bid} crediti")

    lines.append("")
    lines.append(
        f"La mia squadra: budget residuo {_text_field(my_team.get('budget_residuo'))} crediti, "
        f"slot rimasti per ruolo {_text_field(my_team.get('slot_rimasti_per_ruolo'))}, "
        f"{len(my_team.get('giocatori_gia_presi') or [])} giocatori gia' presi."
    )

    if other_teams:
        lines.append("Altre squadre (solo aggregati, mai la loro rosa):")
        for team in other_teams:
            lines.append(
                f"- {_text_field(team.get('nome_squadra'))}: "
                f"{_text_field(team.get('budget_residuo'))} crediti, "
                f"slot rimasti {_text_field(team.get('slot_rimasti_per_ruolo'))}"
            )

    if alternatives:
        lines.append("Migliori alternative libere nello stesso ruolo:")
        for alternative in alternatives[:5]:
            lines.append(
                f"- {_text_field(alternative.get('nome'))} (FVM {_text_field(alternative.get('fvm'))})"
            )

    lines.append("")
    lines.append(
        "Rispondi in italiano, in 2-4 frasi: dai un giudizio netto "
        "(consigliato / valuta / evita) seguito dal motivo principale. "
        "Non ripetere i numeri gia' mostrati a schermo."
    )
    return "\n".join(lines)


def _build_suggest_nomination_prompt(context: dict[str, Any]) -> str:
    """Chooses one of the (already locally-ranked) nomination candidates.

    top_suggestions comes from web/src/nomination-advisor.js: this prompt
    does not re-derive the ranking, it only asks Claude to pick and argue
    for one of the five, adding reasoning a plain score can't (timing, the
    risk a specific opponent grabs it first, the knock-on effect on your
    own remaining budget) rather than restating the numbers already shown.
    """
    my_team = context.get("my_team") or {}
    other_teams = context.get("other_teams") or []
    suggestions = context.get("top_suggestions") or []

    lines = [
        "Sei un consulente esperto di aste del Fantacalcio. Il sistema ha gia' "
        "selezionato in locale 5 giocatori papabili da chiamare adesso: il tuo "
        "compito e' sceglierne UNO solo e argomentare la scelta, non ricalcolare i punteggi.",
        "",
        f"La mia squadra: budget residuo {_text_field(my_team.get('budget_residuo'))} crediti, "
        f"slot rimasti per ruolo {_text_field(my_team.get('slot_rimasti_per_ruolo'))}.",
    ]

    if other_teams:
        lines.append("Altre squadre (solo aggregati, mai la loro rosa):")
        for team in other_teams:
            lines.append(
                f"- {_text_field(team.get('nome_squadra'))}: "
                f"{_text_field(team.get('budget_residuo'))} crediti, "
                f"slot rimasti {_text_field(team.get('slot_rimasti_per_ruolo'))}"
            )

    lines.append("")
    lines.append("Candidati da chiamare adesso, gia' selezionati dal sistema:")
    for suggestion in suggestions[:5]:
        player = suggestion.get("player") or {}
        reasons = suggestion.get("reasons") or []
        lines.append(
            f"- {_text_field(player.get('nome'))} ({_text_field(player.get('ruolo'))}, "
            f"{_text_field(player.get('squadra'))}): {'; '.join(reasons) or 'n/d'}"
        )

    lines.append("")
    lines.append(
        "Rispondi in italiano, tono colloquiale da consulente d'asta, in 2-4 frasi: "
        "scegli UN solo nome tra questi e spiega perche' proprio quello, aggiungendo "
        "un ragionamento che i punteggi da soli non danno (es. tempismo, rischio che "
        "una squadra avversaria in particolare lo chiami per prima, effetto sul tuo "
        "budget residuo per gli slot che ti restano). Non ripetere i punteggi numerici "
        "ne' le motivazioni gia' elencate sopra parola per parola."
    )
    return "\n".join(lines)


def build_advisor_prompt(context: dict[str, Any]) -> str:
    """Builds a concise Italian prompt.

    Only aggregated opponent data (budget, open slots) goes in - never an
    opponent's individual roster - so the model never sees more than a human
    watching the same auction screen would. `context["mode"]` picks which
    of the two advisor flavors to build for; it defaults to
    "evaluate_candidate" so existing callers are unaffected.
    """
    mode = context.get("mode") or "evaluate_candidate"
    if mode == "suggest_nomination":
        return _build_suggest_nomination_prompt(context)
    return _build_evaluate_candidate_prompt(context)


def call_advisor(
    context: dict[str, Any],
    *,
    client: Any = None,
    model: str = DEFAULT_MODEL,
) -> dict[str, Any]:
    """Asks Claude for a short live judgement. Never raises.

    Returns {"available": False, "reason": "missing_api_key"} when no key is
    configured and no client was injected, or {"available": False,
    "reason": "api_error", "detail": "..."} on any network/API failure.
    On success returns {"available": True, "advice": "...", "model": model}.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if client is None and not api_key:
        return {"available": False, "reason": "missing_api_key"}

    try:
        if client is None:
            import anthropic

            client = anthropic.Anthropic(api_key=api_key)
        prompt = build_advisor_prompt(context)
        response = client.with_options(timeout=TIMEOUT_SECONDS).messages.create(
            model=model,
            max_tokens=MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
        advice = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        ).strip()
        if not advice:
            return {"available": False, "reason": "api_error", "detail": "empty response"}
        return {"available": True, "advice": advice, "model": model}
    except Exception as error:  # noqa: BLE001 - any failure must degrade, never raise
        logger.warning("AI advisor call failed: %s", error)
        return {"available": False, "reason": "api_error", "detail": str(error)[:200]}
