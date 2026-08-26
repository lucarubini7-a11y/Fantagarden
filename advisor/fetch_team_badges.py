"""Fetch Serie A team badges from TheSportsDB (one-off setup script).

Standalone script, not part of the live server. Run it once after initial
setup, or again whenever the Serie A team list changes in
data/raw/squadre.csv - see README.md for details.

It writes two things, both committed as static assets:
  - web/public/team-badges/<slug>.png  (one PNG per matched team, resized)
  - web/src/team-badges.json           ({ "Inter": "/team-badges/inter.png", ... })

Usage:
    python advisor/fetch_team_badges.py
"""

import csv
import io
import json
import sys
import time
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SQUADRE_CSV = ROOT / "data" / "raw" / "squadre.csv"
BADGES_DIR = ROOT / "web" / "public" / "team-badges"
BADGES_JSON = ROOT / "web" / "src" / "team-badges.json"

API_BASE = "https://www.thesportsdb.com/api/v1/json/3/searchteams.php"
MAX_SIZE = (128, 128)
REQUEST_TIMEOUT = 15
REQUEST_DELAY = 0.3  # be polite to the free-tier endpoint

# Manual aliases for teams whose name in squadre.csv doesn't match what
# TheSportsDB has on file, tried in order after the plain name fails. When
# the run summary reports a team as missing, it also prints the exact
# name(s) it tried - use that to find the real name on TheSportsDB and add
# it here, then re-run.
ALIASES = {
    "Inter": ["Inter Milan"],
    "Milan": ["AC Milan"],
    "Roma": ["AS Roma"],
    "Napoli": ["SSC Napoli"],
    "Verona": ["Hellas Verona"],
}


def slugify(name):
    return name.strip().lower().replace(" ", "-")


def search_team(name):
    """Return the first Soccer-team match from TheSportsDB, or None."""
    response = requests.get(API_BASE, params={"t": name}, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    payload = response.json()
    teams = payload.get("teams") or []
    for team in teams:
        if team.get("strSport") == "Soccer":
            return team
    return None


def find_badge_url(team_name):
    """Try the CSV name, then any known aliases. Returns (url, tried_names)."""
    tried = [team_name]
    match = search_team(team_name)
    if match is None:
        for alias in ALIASES.get(team_name, []):
            tried.append(alias)
            match = search_team(alias)
            if match is not None:
                break
    if match is None or not match.get("strBadge"):
        return None, tried
    return match["strBadge"], tried


def download_and_resize(url, destination):
    response = requests.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    image = Image.open(io.BytesIO(response.content)).convert("RGBA")
    image.thumbnail(MAX_SIZE, Image.LANCZOS)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="PNG")


def load_team_names():
    with SQUADRE_CSV.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return [row["squadra"] for row in reader]


def main():
    team_names = load_team_names()
    badges = {}
    missing = []

    for index, team in enumerate(team_names):
        if index:
            time.sleep(REQUEST_DELAY)
        try:
            badge_url, tried = find_badge_url(team)
        except requests.RequestException as error:
            print(f"[ERRORE] {team}: richiesta fallita ({error})")
            missing.append(team)
            continue

        if badge_url is None:
            print(f"[MANCANTE] {team}: nessun match Soccer trovato (provati: {', '.join(tried)})")
            missing.append(team)
            continue

        destination = BADGES_DIR / f"{slugify(team)}.png"
        try:
            download_and_resize(badge_url, destination)
        except (requests.RequestException, OSError) as error:
            print(f"[ERRORE] {team}: download o ridimensionamento fallito ({error})")
            missing.append(team)
            continue

        badges[team] = f"/team-badges/{slugify(team)}.png"
        print(f"[OK] {team} -> {destination.relative_to(ROOT)}")

    BADGES_JSON.parent.mkdir(parents=True, exist_ok=True)
    with BADGES_JSON.open("w", encoding="utf-8") as handle:
        json.dump(badges, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")

    found = len(badges)
    total = len(team_names)
    print()
    print(f"{found}/{total} loghi scaricati.")
    if missing:
        print(f"Mancanti: {', '.join(missing)}")
        print("Aggiungi un alias in ALIASES qui sopra e rilancia lo script per questi casi.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
