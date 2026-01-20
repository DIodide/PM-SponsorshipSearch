"""
Logo URL Enrichment Utilities

Provides functions to fetch and validate logo URLs for sports teams.
Strategies:
- League CDN patterns (MLB, NBA, NHL)
- ESPN API fallback
- Directory page scraping (AHL, ECHL)
- Team homepage scraping (G League)
"""

from __future__ import annotations

import re
import time
from typing import Dict, List, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _norm_name(s: str) -> str:
    """Normalize team name for matching."""
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _get(url: str, timeout: int = 25) -> str:
    """Fetch URL content."""
    r = requests.get(url, timeout=timeout, headers=DEFAULT_HEADERS)
    r.raise_for_status()
    return r.text


def _get_json(url: str, timeout: int = 25) -> dict:
    """Fetch JSON from URL."""
    r = requests.get(url, timeout=timeout, headers=DEFAULT_HEADERS)
    r.raise_for_status()
    return r.json()


# ============================================================
# ESPN API - Works for MLB, NBA, NFL, NHL
# ============================================================

ESPN_ENDPOINTS = {
    "nfl": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams",
    "mlb": "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams",
    "nba": "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams",
    "nhl": "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams",
    "wnba": "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams",
    "mls": "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams",
    "nwsl": "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.nwsl/teams",
}


def fetch_espn_logos(league_key: str) -> Dict[str, str]:
    """
    Fetch logo URLs from ESPN API.
    Returns: map of normalized team displayName -> logo href
    """
    url = ESPN_ENDPOINTS.get(league_key.lower())
    if not url:
        return {}

    try:
        data = _get_json(url)
        teams = data.get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", [])
        out: Dict[str, str] = {}
        for t in teams:
            team = t.get("team", {})
            name = team.get("displayName") or ""
            logos = team.get("logos") or []
            if logos and name:
                # Get the first (primary) logo
                out[_norm_name(name)] = logos[0].get("href", "")
        return out
    except Exception as e:
        print(f"ESPN API fetch failed for {league_key}: {e}")
        return {}


def fetch_espn_teams(league_key: str) -> List[dict]:
    """
    Fetch full team data from ESPN API.
    Returns: list of team dicts with fields like displayName, abbreviation, location, logos, etc.
    """
    url = ESPN_ENDPOINTS.get(league_key.lower())
    if not url:
        return []

    try:
        data = _get_json(url)
        teams = data.get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", [])
        out: List[dict] = []
        for t in teams:
            team = t.get("team", {})
            if team.get("displayName"):
                logos = team.get("logos") or []
                out.append({
                    "id": team.get("id"),
                    "displayName": team.get("displayName"),
                    "shortDisplayName": team.get("shortDisplayName"),
                    "abbreviation": team.get("abbreviation"),
                    "location": team.get("location"),  # City/region
                    "nickname": team.get("nickname"),  # Just the team name part
                    "name": team.get("name"),
                    "slug": team.get("slug"),
                    "color": team.get("color"),
                    "alternateColor": team.get("alternateColor"),
                    "isActive": team.get("isActive", True),
                    "logo_url": logos[0].get("href") if logos else None,
                    "links": team.get("links", []),
                })
        return out
    except Exception as e:
        print(f"ESPN API fetch failed for {league_key}: {e}")
        return []


# ============================================================
# MLB/MiLB - MLB Static CDN
# ============================================================


def mlbstatic_logo(team_id: int, variant: str = "team-cap-on-light") -> str:
    """
    Generate MLB Static CDN logo URL.
    Variants: "team-cap-on-light", "team-cap-on-dark"
    """
    return f"https://www.mlbstatic.com/team-logos/{variant}/{team_id}.svg"


def fetch_mlb_milb_logos(teams: List[dict]) -> Dict[int, str]:
    """
    For MLB/MiLB teams with team_id, generate logo URLs.
    Falls back to ESPN API for MLB teams without working CDN URLs.
    """
    # First, try CDN URLs for all teams with team_id
    logos: Dict[int, str] = {}

    for team in teams:
        team_id = team.get("team_id")
        if isinstance(team_id, int) and team_id > 0:
            logos[team_id] = mlbstatic_logo(team_id)

    return logos


# ============================================================
# NBA - NBA CDN (requires team ID mapping)
# ============================================================

# NBA team ID mapping (from nba.com URLs/API)
NBA_TEAM_IDS = {
    "atlantahawks": 1610612737,
    "bostonceltics": 1610612738,
    "brooklynnets": 1610612751,
    "charlottehornets": 1610612766,
    "chicagobulls": 1610612741,
    "clevelandcavaliers": 1610612739,
    "dallasmavericks": 1610612742,
    "denvernuggets": 1610612743,
    "detroitpistons": 1610612765,
    "goldenstatewarriors": 1610612744,
    "houstonrockets": 1610612745,
    "indianapacers": 1610612754,
    "laclippers": 1610612746,
    "losangeleslakers": 1610612747,
    "memphisgrizzlies": 1610612763,
    "miamiheat": 1610612748,
    "milwaukeebucks": 1610612749,
    "minnesotatimberwolves": 1610612750,
    "neworleanspelicans": 1610612740,
    "newyorkknicks": 1610612752,
    "oklahomacitythunder": 1610612760,
    "orlandomagic": 1610612753,
    "philadelphia76ers": 1610612755,
    "phoenixsuns": 1610612756,
    "portlandtrailblazers": 1610612757,
    "sacramentokings": 1610612758,
    "sanantoniospurs": 1610612759,
    "torontoraptors": 1610612761,
    "utahjazz": 1610612762,
    "washingtonwizards": 1610612764,
}


def nba_cdn_logo(team_id: int, light: bool = True) -> str:
    """Generate NBA CDN logo URL."""
    v = "L" if light else "D"
    return f"https://cdn.nba.com/logos/nba/{team_id}/primary/{v}/logo.svg"


def fetch_nba_logos(teams: List[dict]) -> Dict[str, str]:
    """
    Fetch NBA logo URLs using CDN pattern.
    Falls back to ESPN API.
    """
    logos: Dict[str, str] = {}
    espn_logos = fetch_espn_logos("nba")

    for team in teams:
        name = team.get("name", "")
        norm = _norm_name(name)

        # Try NBA CDN first
        team_id = NBA_TEAM_IDS.get(norm)
        if team_id:
            logos[norm] = nba_cdn_logo(team_id)
        elif espn_logos.get(norm):
            logos[norm] = espn_logos[norm]

    return logos


# ============================================================
# G League - Scrape directory page for logos
# ============================================================

_GLEAGUE_LOGO_RE = re.compile(
    r"https://ak-static\.cms\.nba\.com/wp-content/uploads/logos/nbagleague/(\d+)/primary/[LD]/logo\.svg"
)
_GLEAGUE_TEAM_LINK_RE = re.compile(r"https://([a-z0-9]+)\.gleague\.nba\.com/?$")


def fetch_gleague_logos_directory() -> Dict[str, str]:
    """
    Scrape G League directory page for logo URLs.
    Returns map of subdomain -> logo URL.
    """
    url = "https://gleague.nba.com/teams/"
    logos: Dict[str, str] = {}

    try:
        html = _get(url)
        soup = BeautifulSoup(html, "html.parser")

        # Find all team link anchors with images
        for a in soup.find_all("a", href=_GLEAGUE_TEAM_LINK_RE):
            href = a["href"]
            m = _GLEAGUE_TEAM_LINK_RE.match(href)
            if not m:
                continue
            subdomain = m.group(1)

            # Look for logo in this anchor
            img = a.find("img", src=_GLEAGUE_LOGO_RE)
            if img:
                logo_url = img["src"].replace("/D/", "/L/")
                logos[subdomain] = logo_url

    except Exception as e:
        print(f"G League directory fetch failed: {e}")

    return logos


def fetch_gleague_logos(teams: List[dict]) -> Dict[str, str]:
    """
    Fetch G League logos by scraping the directory page.
    Maps team names to logos based on their official URL subdomain.
    """
    # Get subdomain -> logo mapping
    subdomain_logos = fetch_gleague_logos_directory()

    logos: Dict[str, str] = {}

    for team in teams:
        url = team.get("official_url", "")
        name = team.get("name", "")
        norm = _norm_name(name)

        # Extract subdomain from team URL
        m = _GLEAGUE_TEAM_LINK_RE.match(url.rstrip("/") + "/")
        if m:
            subdomain = m.group(1)
            if subdomain in subdomain_logos:
                logos[norm] = subdomain_logos[subdomain]

    return logos


# ============================================================
# NFL - ESPN API (most reliable)
# ============================================================


def fetch_nfl_logos() -> Dict[str, str]:
    """
    Fetch NFL logo URLs from ESPN API.
    Returns map of normalized team name -> logo URL.
    """
    return fetch_espn_logos("nfl")


# ============================================================
# NHL - NHL Assets CDN + ESPN fallback
# ============================================================

# NHL team abbreviation mapping
NHL_ABBREVIATIONS = {
    "anaheim ducks": "ANA",
    "arizona coyotes": "ARI",
    "boston bruins": "BOS",
    "buffalo sabres": "BUF",
    "calgary flames": "CGY",
    "carolina hurricanes": "CAR",
    "chicago blackhawks": "CHI",
    "colorado avalanche": "COL",
    "columbus blue jackets": "CBJ",
    "dallas stars": "DAL",
    "detroit red wings": "DET",
    "edmonton oilers": "EDM",
    "florida panthers": "FLA",
    "los angeles kings": "LAK",
    "minnesota wild": "MIN",
    "montreal canadiens": "MTL",
    "nashville predators": "NSH",
    "new jersey devils": "NJD",
    "new york islanders": "NYI",
    "new york rangers": "NYR",
    "ottawa senators": "OTT",
    "philadelphia flyers": "PHI",
    "pittsburgh penguins": "PIT",
    "san jose sharks": "SJS",
    "seattle kraken": "SEA",
    "st. louis blues": "STL",
    "tampa bay lightning": "TBL",
    "toronto maple leafs": "TOR",
    "utah hockey club": "UTA",
    "vancouver canucks": "VAN",
    "vegas golden knights": "VGK",
    "washington capitals": "WSH",
    "winnipeg jets": "WPG",
}


def nhl_assets_logo(team_abbrev: str, light: bool = True) -> str:
    """Generate NHL Assets CDN logo URL."""
    v = "light" if light else "dark"
    return f"https://assets.nhle.com/logos/nhl/svg/{team_abbrev.upper()}_{v}.svg"


def fetch_nhl_logos(teams: List[dict]) -> Dict[str, str]:
    """
    Fetch NHL logos using NHL Assets CDN.
    Falls back to ESPN API.
    """
    logos: Dict[str, str] = {}
    espn_logos = fetch_espn_logos("nhl")

    for team in teams:
        name = team.get("name", "")
        norm = _norm_name(name)
        name_lower = name.lower()

        # Try NHL CDN first
        abbrev = NHL_ABBREVIATIONS.get(name_lower)
        if abbrev:
            logos[norm] = nhl_assets_logo(abbrev)
        elif espn_logos.get(norm):
            logos[norm] = espn_logos[norm]

    return logos


# ============================================================
# AHL - Scrape directory page
# ============================================================

_AHL_LOGO_RE = re.compile(
    r"https://theahl\.com/wp-content/uploads/sites/3/\d{4}/\d{2}/[a-z0-9_-]+1200\.png",
    re.I,
)


def fetch_ahl_logos() -> Dict[str, str]:
    """
    Scrape AHL directory page for logo URLs.
    Returns map of normalized team name -> logo URL.
    """
    url = "https://theahl.com/team-map-directory"
    logos: Dict[str, str] = {}

    try:
        html = _get(url)
        soup = BeautifulSoup(html, "html.parser")

        # Find all logo images ending in 1200.png
        for img in soup.find_all("img", src=_AHL_LOGO_RE):
            logo_url = img.get("src")
            if not logo_url:
                continue

            # Walk forward to find the team name
            cur = img
            name = None
            for _ in range(120):
                cur = cur.next_element
                if cur is None:
                    break
                if hasattr(cur, "string") and cur.string:
                    s = str(cur.string).strip()
                    if (
                        s
                        and re.search(r"[A-Za-z]", s)
                        and not re.fullmatch(r"[\d\-\(\)\s]+", s)
                    ):
                        # Skip phone numbers and other numeric strings
                        if len(s) > 3 and not s.startswith("("):
                            name = s
                            break

            if name:
                logos[_norm_name(name)] = logo_url

    except Exception as e:
        print(f"AHL logo fetch failed: {e}")

    return logos


# ============================================================
# ECHL - Scrape teams directory page
# ============================================================

_ECHL_LOGO_RE = re.compile(r"https://assets\.leaguestat\.com/echl/logos/\d+\.png")


def fetch_echl_logos_directory() -> Dict[str, str]:
    """
    Scrape ECHL teams directory page for logo URLs.
    Returns map of normalized team name -> logo URL.
    """
    url = "https://echl.com/teams"
    logos: Dict[str, str] = {}

    try:
        html = _get(url)
        soup = BeautifulSoup(html, "html.parser")

        for img in soup.find_all("img", src=_ECHL_LOGO_RE):
            logo_url = img["src"]

            # Find team name near this image
            parent = img
            for _ in range(6):
                parent = parent.parent
                if parent is None:
                    break

                # Look for team name link
                for a in parent.find_all("a"):
                    href = a.get("href", "")
                    text = a.get_text(strip=True)
                    if "echl.com/teams/" in href and text and len(text) > 5:
                        norm = _norm_name(text)
                        if norm not in logos:
                            logos[norm] = logo_url
                        break

    except Exception as e:
        print(f"ECHL directory fetch failed: {e}")

    return logos


def fetch_echl_logos(teams: List[dict] = None) -> Dict[str, str]:
    """
    Fetch ECHL logos from the directory page.
    Returns map of normalized team name -> logo URL.
    """
    return fetch_echl_logos_directory()


# ============================================================
# Utility: Enrich teams with logos
# ============================================================


def enrich_with_logos(
    teams: List[dict], logo_map: Dict[str, str], name_field: str = "name"
) -> List[dict]:
    """
    Add logo_url field to team dicts using a precomputed logo map.
    """
    for team in teams:
        name = team.get(name_field, "")
        norm = _norm_name(name)
        logo = logo_map.get(norm)
        if logo:
            team["logo_url"] = logo
    return teams
