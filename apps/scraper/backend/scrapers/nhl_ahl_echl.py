"""
NHL + AHL + ECHL Teams Scraper
- Scrapes team data from official hockey league directories
- Outputs JSON and Excel files with team data
- Enriches with logo URLs from NHL CDN, AHL directory, and ECHL directory
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup

from .logo_utils import (
    fetch_espn_logos,
    fetch_nhl_logos,
    fetch_ahl_logos,
    fetch_echl_logos,
    nhl_assets_logo,
    NHL_ABBREVIATIONS,
    _norm_name,
)


NHL_TEAMS_URL = "https://www.nhl.com/info/teams/"
AHL_DIR_URL = "https://theahl.com/team-map-directory"
ECHL_TEAMS_URL = "https://echl.com/teams"

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Two-word nicknames that need special handling for region extraction
TWO_WORD_NICKNAMES = {
    "Blue Jackets",
    "Golden Knights",
    "Red Wings",
    "Maple Leafs",
    "Wolf Pack",
    "Silver Knights",
    "Solar Bears",
    "Knight Monsters",
    "Swamp Rabbits",
}

# Static NHL teams as fallback (32 teams)
NHL_TEAMS_STATIC = [
    ("Anaheim Ducks", "Anaheim", "https://www.nhl.com/ducks"),
    ("Arizona Coyotes", "Arizona", "https://www.nhl.com/coyotes"),
    ("Boston Bruins", "Boston", "https://www.nhl.com/bruins"),
    ("Buffalo Sabres", "Buffalo", "https://www.nhl.com/sabres"),
    ("Calgary Flames", "Calgary", "https://www.nhl.com/flames"),
    ("Carolina Hurricanes", "Carolina", "https://www.nhl.com/hurricanes"),
    ("Chicago Blackhawks", "Chicago", "https://www.nhl.com/blackhawks"),
    ("Colorado Avalanche", "Colorado", "https://www.nhl.com/avalanche"),
    ("Columbus Blue Jackets", "Columbus", "https://www.nhl.com/bluejackets"),
    ("Dallas Stars", "Dallas", "https://www.nhl.com/stars"),
    ("Detroit Red Wings", "Detroit", "https://www.nhl.com/redwings"),
    ("Edmonton Oilers", "Edmonton", "https://www.nhl.com/oilers"),
    ("Florida Panthers", "Florida", "https://www.nhl.com/panthers"),
    ("Los Angeles Kings", "Los Angeles", "https://www.nhl.com/kings"),
    ("Minnesota Wild", "Minnesota", "https://www.nhl.com/wild"),
    ("Montreal Canadiens", "Montreal", "https://www.nhl.com/canadiens"),
    ("Nashville Predators", "Nashville", "https://www.nhl.com/predators"),
    ("New Jersey Devils", "New Jersey", "https://www.nhl.com/devils"),
    ("New York Islanders", "New York", "https://www.nhl.com/islanders"),
    ("New York Rangers", "New York", "https://www.nhl.com/rangers"),
    ("Ottawa Senators", "Ottawa", "https://www.nhl.com/senators"),
    ("Philadelphia Flyers", "Philadelphia", "https://www.nhl.com/flyers"),
    ("Pittsburgh Penguins", "Pittsburgh", "https://www.nhl.com/penguins"),
    ("San Jose Sharks", "San Jose", "https://www.nhl.com/sharks"),
    ("Seattle Kraken", "Seattle", "https://www.nhl.com/kraken"),
    ("St. Louis Blues", "St. Louis", "https://www.nhl.com/blues"),
    ("Tampa Bay Lightning", "Tampa Bay", "https://www.nhl.com/lightning"),
    ("Toronto Maple Leafs", "Toronto", "https://www.nhl.com/mapleleafs"),
    ("Utah Hockey Club", "Utah", "https://www.nhl.com/utah"),
    ("Vancouver Canucks", "Vancouver", "https://www.nhl.com/canucks"),
    ("Vegas Golden Knights", "Vegas", "https://www.nhl.com/goldenknights"),
    ("Washington Capitals", "Washington", "https://www.nhl.com/capitals"),
    ("Winnipeg Jets", "Winnipeg", "https://www.nhl.com/jets"),
]

# Static AHL teams as fallback
AHL_TEAMS_STATIC = [
    ("Abbotsford Canucks", "Abbotsford", "https://abbotsford.canucks.com/"),
    ("Bakersfield Condors", "Bakersfield", "https://www.bakersfieldcondors.com/"),
    ("Belleville Senators", "Belleville", "https://www.bellevillesens.com/"),
    ("Bridgeport Islanders", "Bridgeport", "https://www.bridgeportislanders.com/"),
    ("Calgary Wranglers", "Calgary", "https://www.calgarywranglers.com/"),
    ("Charlotte Checkers", "Charlotte", "https://www.gocheckers.com/"),
    ("Chicago Wolves", "Chicago", "https://www.chicagowolves.com/"),
    ("Cleveland Monsters", "Cleveland", "https://www.clevelandmonsters.com/"),
    ("Coachella Valley Firebirds", "Coachella Valley", "https://www.cvfirebirds.com/"),
    ("Colorado Eagles", "Colorado", "https://www.coloradoeagles.com/"),
    ("Grand Rapids Griffins", "Grand Rapids", "https://www.griffinshockey.com/"),
    ("Hartford Wolf Pack", "Hartford", "https://www.hartfordwolfpack.com/"),
    (
        "Henderson Silver Knights",
        "Henderson",
        "https://www.hendersonsilverknights.com/",
    ),
    ("Hershey Bears", "Hershey", "https://www.hersheybears.com/"),
    ("Iowa Wild", "Iowa", "https://www.iowawild.com/"),
    ("Laval Rocket", "Laval", "https://www.rocketlaval.com/"),
    ("Lehigh Valley Phantoms", "Lehigh Valley", "https://www.phantomshockey.com/"),
    ("Manitoba Moose", "Manitoba", "https://moosehockey.com/"),
    ("Milwaukee Admirals", "Milwaukee", "https://www.milwaukeeadmirals.com/"),
    ("Ontario Reign", "Ontario", "https://www.ontarioreign.com/"),
    ("Providence Bruins", "Providence", "https://www.providencebruins.com/"),
    ("Rochester Americans", "Rochester", "https://www.amerks.com/"),
    ("Rockford IceHogs", "Rockford", "https://www.icehogs.com/"),
    ("San Diego Gulls", "San Diego", "https://www.sandiegogulls.com/"),
    ("San Jose Barracuda", "San Jose", "https://www.sjbarracuda.com/"),
    (
        "Springfield Thunderbirds",
        "Springfield",
        "https://www.springfieldthunderbirds.com/",
    ),
    ("Syracuse Crunch", "Syracuse", "https://www.syracusecrunch.com/"),
    ("Texas Stars", "Texas", "https://www.texasstars.com/"),
    ("Toronto Marlies", "Toronto", "https://marlies.ca/"),
    ("Tucson Roadrunners", "Tucson", "https://www.tucsonroadrunners.com/"),
    ("Utica Comets", "Utica", "https://www.uticacomets.com/"),
    (
        "Wilkes-Barre/Scranton Penguins",
        "Wilkes-Barre/Scranton",
        "https://www.wbspenguins.com/",
    ),
]

# Static ECHL teams as fallback
ECHL_TEAMS_STATIC = [
    ("Adirondack Thunder", "Adirondack", "https://www.echlthunder.com/"),
    ("Allen Americans", "Allen", "https://www.allenamericans.com/"),
    ("Atlanta Gladiators", "Atlanta", "https://www.atlantagladiators.com/"),
    ("Cincinnati Cyclones", "Cincinnati", "https://www.cycloneshockey.com/"),
    ("Florida Everblades", "Florida", "https://www.floridaeverblades.com/"),
    ("Fort Wayne Komets", "Fort Wayne", "https://www.komets.com/"),
    ("Greenville Swamp Rabbits", "Greenville", "https://www.swamprabbits.com/"),
    ("Idaho Steelheads", "Idaho", "https://www.idahosteelheads.com/"),
    ("Indy Fuel", "Indianapolis", "https://www.indyfuel.com/"),
    ("Iowa Heartlanders", "Iowa", "https://www.iowaheartlanders.com/"),
    ("Jacksonville Icemen", "Jacksonville", "https://www.jaxicemen.com/"),
    ("Kalamazoo Wings", "Kalamazoo", "https://www.kwings.com/"),
    ("Kansas City Mavericks", "Kansas City", "https://www.kcmavericks.com/"),
    ("Maine Mariners", "Maine", "https://www.mariners.com/"),
    ("Norfolk Admirals", "Norfolk", "https://www.norfolkadmirals.com/"),
    ("Orlando Solar Bears", "Orlando", "https://www.orlandosolarbears.com/"),
    ("Rapid City Rush", "Rapid City", "https://www.rapidcityrush.com/"),
    ("Reading Royals", "Reading", "https://www.royalshockey.com/"),
    ("Savannah Ghost Pirates", "Savannah", "https://www.ghostpirateshockey.com/"),
    ("South Carolina Stingrays", "South Carolina", "https://www.staboratory.com/"),
    ("Tahoe Knight Monsters", "Tahoe", "https://www.tahoekm.com/"),
    ("Toledo Walleye", "Toledo", "https://www.toledowalleye.com/"),
    ("Trois-Rivières Lions", "Trois-Rivières", "https://www.lions3r.com/"),
    ("Tulsa Oilers", "Tulsa", "https://www.tulsaoilers.com/"),
    ("Utah Grizzlies", "Utah", "https://www.utahgrizzlies.com/"),
    ("Wheeling Nailers", "Wheeling", "https://www.wheelingnailers.com/"),
    ("Wichita Thunder", "Wichita", "https://www.wichitathunder.com/"),
    ("Worcester Railers", "Worcester", "https://www.railershc.com/"),
]


@dataclass
class TeamRow:
    name: str
    region: str
    league: str
    target_demographic: str
    official_url: str
    category: str
    logo_url: Optional[str] = None


@dataclass
class ScrapeResult:
    success: bool
    teams_count: int
    nhl_count: int
    ahl_count: int
    echl_count: int
    duration_ms: int
    timestamp: str
    json_path: Optional[str] = None
    xlsx_path: Optional[str] = None
    error: Optional[str] = None
    used_fallback: bool = False


class NHLAHLECHLScraper:
    """Scraper for NHL, AHL, and ECHL teams."""

    name = "NHL, AHL & ECHL Teams"
    description = (
        "Scrapes team data from NHL.com, TheAHL.com, and ECHL.com official directories."
    )
    source_url = "https://www.nhl.com/info/teams/"

    def __init__(self, output_dir: Path | str = "data"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)

    def _get_soup(self, url: str, timeout_s: int = 30) -> BeautifulSoup:
        """Fetch and parse HTML from URL."""
        response = self.session.get(url, timeout=timeout_s)
        response.raise_for_status()
        return BeautifulSoup(response.text, "html.parser")

    def _infer_region(self, team_name: str) -> str:
        """Extract region from team name."""
        prefixes = [
            "New York",
            "New Jersey",
            "Los Angeles",
            "San Jose",
            "St. Louis",
            "Tampa Bay",
            "Rio Grande Valley",
            "Salt Lake City",
            "South Bay",
            "Long Island",
            "Grand Rapids",
            "Wilkes-Barre/Scranton",
            "Lehigh Valley",
            "San Diego",
            "Fort Wayne",
            "Rapid City",
            "South Carolina",
            "Kansas City",
            "Mexico City",
            "Oklahoma City",
            "Las Vegas",
            "Vegas",
            "Coachella Valley",
        ]
        for p in sorted(prefixes, key=len, reverse=True):
            if team_name.startswith(p + " "):
                return p

        parts = team_name.split()
        if len(parts) >= 2:
            last2 = " ".join(parts[-2:])
            if last2 in TWO_WORD_NICKNAMES and len(parts) >= 3:
                return " ".join(parts[:-2])

        return " ".join(parts[:-1]) if len(parts) >= 2 else team_name

    def _make_row(self, name: str, league: str, url: str, category: str) -> TeamRow:
        """Create a TeamRow with inferred demographics."""
        region = self._infer_region(name)
        if league == "NHL":
            demo = f"Hockey fans in and around {region}, plus the broader NHL audience."
        else:
            demo = f"Local hockey fans and player-development followers in and around {region}."
        return TeamRow(
            name=name,
            region=region,
            league=league,
            target_demographic=demo,
            official_url=url,
            category=category,
        )

    # ---------- NHL ----------
    def _parse_nhl_teams_live(self, soup: BeautifulSoup) -> List[TeamRow]:
        """Parse NHL teams from live HTML."""
        teams: Dict[str, str] = {}
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            text = a.get_text(" ", strip=True)
            if not re.fullmatch(r"https://www\.nhl\.com/[a-z0-9-]+", href):
                continue
            if not text or " " not in text:
                continue
            text = re.sub(
                r"\s+(north_east|north|south|east|west)$", "", text, flags=re.I
            ).strip()

            path = urlparse(href).path.strip("/")
            if len(path) <= 2:
                continue

            teams[href] = text

        rows = [
            self._make_row(name, "NHL", url, "Major")
            for url, name in sorted(teams.items(), key=lambda x: x[1])
        ]
        return rows

    def _get_nhl_teams_static(self) -> List[TeamRow]:
        """Get NHL teams from static data."""
        return [
            self._make_row(name, "NHL", url, "Major")
            for name, region, url in NHL_TEAMS_STATIC
        ]

    # ---------- AHL ----------
    def _pick_primary_site(self, links: List[str]) -> str:
        """Pick non-social team website from list of links."""
        bad = [
            "facebook.com",
            "twitter.com",
            "x.com",
            "instagram.com",
            "youtube.com",
            "tiktok.com",
            "theahl.com",
        ]
        for href in links:
            h = href.strip()
            if not h.startswith("http"):
                continue
            if any(b in h.lower() for b in bad):
                continue
            return h
        return ""

    def _parse_ahl_teams_live(self, soup: BeautifulSoup) -> List[TeamRow]:
        """Parse AHL teams from live HTML."""
        nodes = soup.find_all(string=re.compile(r"NHL Affiliation:", re.I))
        rows: List[TeamRow] = []

        for node in nodes:
            container = node.parent.find_parent("div")
            if not container:
                continue
            text = container.get_text(" ", strip=True)

            m = re.match(r"^(.+?)\s*\(", text)
            if not m:
                m = re.match(r"^(.+?)\s+NHL Affiliation", text)

            team_name = (
                m.group(1).strip() if m else text.split("NHL Affiliation")[0].strip()
            )
            links = [a["href"] for a in container.find_all("a", href=True)]
            url = self._pick_primary_site(links)

            if team_name and url:
                rows.append(self._make_row(team_name, "AHL", url, "Minor"))

        # Dedupe by name
        dedup = {r.name: r for r in rows}
        return [dedup[name] for name in sorted(dedup)]

    def _get_ahl_teams_static(self) -> List[TeamRow]:
        """Get AHL teams from static data."""
        return [
            self._make_row(name, "AHL", url, "Minor")
            for name, region, url in AHL_TEAMS_STATIC
        ]

    # ---------- ECHL ----------
    def _parse_echl_teams_live(self, soup: BeautifulSoup) -> List[TeamRow]:
        """Parse ECHL teams from live HTML."""
        profile_pairs: List[Tuple[str, str]] = []
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            text = a.get_text(" ", strip=True)
            if not text or " " not in text:
                continue
            if href.rstrip("/") == "https://echl.com/teams":
                continue
            if re.match(r"^https://echl\.com/teams", href):
                if text.lower() in {"info & stats", "info and stats"}:
                    continue
                if "&" in text:
                    continue
                profile_pairs.append((text, href))

        team_names = {name for name, _ in profile_pairs}

        name_to_links: Dict[str, set] = defaultdict(set)
        for a in soup.find_all("a", href=True):
            text = a.get_text(" ", strip=True)
            href = a["href"].strip()
            if text in team_names:
                name_to_links[text].add(href)

        def pick_team_site(name: str) -> str:
            links = sorted(name_to_links[name])
            for h in links:
                hl = h.lower()
                if "echl.com/teams" in hl:
                    continue
                if hl.startswith("https://echl.com") or hl.startswith(
                    "http://echl.com"
                ):
                    continue
                if any(
                    s in hl
                    for s in [
                        "facebook.com",
                        "twitter.com",
                        "x.com",
                        "instagram.com",
                        "youtube.com",
                        "tiktok.com",
                        "flosports.link",
                    ]
                ):
                    continue
                return h
            for n, prof in profile_pairs:
                if n == name:
                    return prof
            return ""

        rows = []
        for name in sorted(team_names):
            url = pick_team_site(name)
            if url:
                rows.append(self._make_row(name, "ECHL", url, "Minor"))
        return rows

    def _get_echl_teams_static(self) -> List[TeamRow]:
        """Get ECHL teams from static data."""
        return [
            self._make_row(name, "ECHL", url, "Minor")
            for name, region, url in ECHL_TEAMS_STATIC
        ]

    def _write_outputs(
        self, rows: List[TeamRow], json_path: Path, xlsx_path: Path
    ) -> None:
        """Write team data to JSON and Excel files."""
        df = pd.DataFrame([asdict(r) for r in rows])

        df_nhl = (
            df[df["league"] == "NHL"]
            .sort_values(["region", "name"])
            .reset_index(drop=True)
        )
        df_ahl = (
            df[df["league"] == "AHL"]
            .sort_values(["region", "name"])
            .reset_index(drop=True)
        )
        df_echl = (
            df[df["league"] == "ECHL"]
            .sort_values(["region", "name"])
            .reset_index(drop=True)
        )
        df_all = df.sort_values(["category", "league", "region", "name"]).reset_index(
            drop=True
        )

        # Write JSON
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(df_all.to_dict(orient="records"), f, ensure_ascii=False, indent=2)

        # Write Excel with multiple sheets
        with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
            df_all.to_excel(writer, index=False, sheet_name="All Teams")
            df_nhl.to_excel(writer, index=False, sheet_name="NHL")
            df_ahl.to_excel(writer, index=False, sheet_name="AHL")
            df_echl.to_excel(writer, index=False, sheet_name="ECHL")

    def _enrich_with_logos(
        self,
        nhl_rows: List[TeamRow],
        ahl_rows: List[TeamRow],
        echl_rows: List[TeamRow],
    ) -> None:
        """Add logo URLs to team rows."""
        # NHL logos from NHL CDN or ESPN
        espn_logos = fetch_espn_logos("nhl")

        for row in nhl_rows:
            name_lower = row.name.lower()
            abbrev = NHL_ABBREVIATIONS.get(name_lower)
            if abbrev:
                row.logo_url = nhl_assets_logo(abbrev)
            else:
                norm = _norm_name(row.name)
                if norm in espn_logos:
                    row.logo_url = espn_logos[norm]

        # AHL logos from directory
        ahl_logos = fetch_ahl_logos()
        for row in ahl_rows:
            norm = _norm_name(row.name)
            if norm in ahl_logos:
                row.logo_url = ahl_logos[norm]

        # ECHL logos from directory
        echl_logos = fetch_echl_logos()
        for row in echl_rows:
            norm = _norm_name(row.name)
            if norm in echl_logos:
                row.logo_url = echl_logos[norm]

    def run(self) -> ScrapeResult:
        """Execute the scrape and return results."""
        start_time = datetime.now()
        used_fallback = False

        try:
            # NHL
            try:
                nhl_soup = self._get_soup(NHL_TEAMS_URL)
                nhl_rows = self._parse_nhl_teams_live(nhl_soup)
                if len(nhl_rows) < 28:
                    nhl_rows = self._get_nhl_teams_static()
                    used_fallback = True
            except Exception:
                nhl_rows = self._get_nhl_teams_static()
                used_fallback = True

            # AHL
            try:
                ahl_soup = self._get_soup(AHL_DIR_URL)
                ahl_rows = self._parse_ahl_teams_live(ahl_soup)
                if len(ahl_rows) < 20:
                    ahl_rows = self._get_ahl_teams_static()
                    used_fallback = True
            except Exception:
                ahl_rows = self._get_ahl_teams_static()
                used_fallback = True

            # ECHL
            try:
                echl_soup = self._get_soup(ECHL_TEAMS_URL)
                echl_rows = self._parse_echl_teams_live(echl_soup)
                if len(echl_rows) < 20:
                    echl_rows = self._get_echl_teams_static()
                    used_fallback = True
            except Exception:
                echl_rows = self._get_echl_teams_static()
                used_fallback = True

            # Enrich with logos
            self._enrich_with_logos(nhl_rows, ahl_rows, echl_rows)

            rows = nhl_rows + ahl_rows + echl_rows

            # Generate output paths with timestamp
            timestamp = start_time.strftime("%Y%m%d_%H%M%S")
            json_path = self.output_dir / f"nhl_ahl_echl_teams_{timestamp}.json"
            xlsx_path = self.output_dir / f"nhl_ahl_echl_teams_{timestamp}.xlsx"

            # Write outputs
            self._write_outputs(rows, json_path, xlsx_path)

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            return ScrapeResult(
                success=True,
                teams_count=len(rows),
                nhl_count=len(nhl_rows),
                ahl_count=len(ahl_rows),
                echl_count=len(echl_rows),
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
                json_path=str(json_path),
                xlsx_path=str(xlsx_path),
                used_fallback=used_fallback,
            )

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            return ScrapeResult(
                success=False,
                teams_count=0,
                nhl_count=0,
                ahl_count=0,
                echl_count=0,
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
                error=str(e),
                used_fallback=used_fallback,
            )

    def get_latest_data(self) -> Optional[List[Dict[str, Any]]]:
        """Get the most recent scraped data."""
        json_files = sorted(
            self.output_dir.glob("nhl_ahl_echl_teams_*.json"), reverse=True
        )
        if not json_files:
            return None

        with open(json_files[0], "r", encoding="utf-8") as f:
            return json.load(f)
