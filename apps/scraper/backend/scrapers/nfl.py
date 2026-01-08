"""
NFL Teams Scraper
- Scrapes team data from NFL.com official directory
- Outputs JSON and Excel files with team data
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import requests
from bs4 import BeautifulSoup


NFL_TEAMS_URL = "https://www.nfl.com/teams/"

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Static NFL teams data as fallback (32 teams)
NFL_TEAMS_STATIC = [
    ("Arizona Cardinals", "Arizona", "https://www.azcardinals.com/"),
    ("Atlanta Falcons", "Atlanta", "https://www.atlantafalcons.com/"),
    ("Baltimore Ravens", "Baltimore", "https://www.baltimoreravens.com/"),
    ("Buffalo Bills", "Buffalo", "https://www.buffalobills.com/"),
    ("Carolina Panthers", "Carolina", "https://www.panthers.com/"),
    ("Chicago Bears", "Chicago", "https://www.chicagobears.com/"),
    ("Cincinnati Bengals", "Cincinnati", "https://www.bengals.com/"),
    ("Cleveland Browns", "Cleveland", "https://www.clevelandbrowns.com/"),
    ("Dallas Cowboys", "Dallas", "https://www.dallascowboys.com/"),
    ("Denver Broncos", "Denver", "https://www.denverbroncos.com/"),
    ("Detroit Lions", "Detroit", "https://www.detroitlions.com/"),
    ("Green Bay Packers", "Green Bay", "https://www.packers.com/"),
    ("Houston Texans", "Houston", "https://www.houstontexans.com/"),
    ("Indianapolis Colts", "Indianapolis", "https://www.colts.com/"),
    ("Jacksonville Jaguars", "Jacksonville", "https://www.jaguars.com/"),
    ("Kansas City Chiefs", "Kansas City", "https://www.chiefs.com/"),
    ("Las Vegas Raiders", "Las Vegas", "https://www.raiders.com/"),
    ("Los Angeles Chargers", "Los Angeles", "https://www.chargers.com/"),
    ("Los Angeles Rams", "Los Angeles", "https://www.therams.com/"),
    ("Miami Dolphins", "Miami", "https://www.miamidolphins.com/"),
    ("Minnesota Vikings", "Minnesota", "https://www.vikings.com/"),
    ("New England Patriots", "New England", "https://www.patriots.com/"),
    ("New Orleans Saints", "New Orleans", "https://www.neworleanssaints.com/"),
    ("New York Giants", "New York", "https://www.giants.com/"),
    ("New York Jets", "New York", "https://www.newyorkjets.com/"),
    ("Philadelphia Eagles", "Philadelphia", "https://www.philadelphiaeagles.com/"),
    ("Pittsburgh Steelers", "Pittsburgh", "https://www.steelers.com/"),
    ("San Francisco 49ers", "San Francisco", "https://www.49ers.com/"),
    ("Seattle Seahawks", "Seattle", "https://www.seahawks.com/"),
    ("Tampa Bay Buccaneers", "Tampa Bay", "https://www.buccaneers.com/"),
    ("Tennessee Titans", "Tennessee", "https://www.tennesseetitans.com/"),
    ("Washington Commanders", "Washington", "https://www.commanders.com/"),
]


@dataclass
class TeamRow:
    name: str
    region: str
    league: str
    target_demographic: str
    official_url: str
    category: str


@dataclass
class ScrapeResult:
    success: bool
    teams_count: int
    nfl_count: int
    duration_ms: int
    timestamp: str
    json_path: Optional[str] = None
    xlsx_path: Optional[str] = None
    error: Optional[str] = None
    used_fallback: bool = False


class NFLScraper:
    """Scraper for NFL teams."""

    name = "NFL Teams"
    description = "Scrapes team data from NFL.com official directory."
    source_url = "https://www.nfl.com/teams/"

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
        """Extract region/city from team name."""
        multiword_regions = [
            "New York",
            "Los Angeles",
            "San Francisco",
            "Kansas City",
            "Las Vegas",
            "New England",
            "New Orleans",
            "Tampa Bay",
            "Green Bay",
        ]
        for r in multiword_regions:
            if team_name.startswith(r + " "):
                return r
        return team_name.split()[0] if team_name else ""

    def _extract_team_name_near_link(self, a_tag) -> Optional[str]:
        """Walk up DOM to find team name near link."""
        node = a_tag
        for _ in range(6):
            node = node.parent
            if node is None:
                break

            candidates = []
            for tag in node.find_all(
                ["h1", "h2", "h3", "h4", "strong", "span", "p"], limit=40
            ):
                txt = tag.get_text(" ", strip=True)
                if txt and 6 <= len(txt) <= 40 and re.search(r"[A-Za-z]", txt):
                    candidates.append(txt)

            bad = {
                "View Profile",
                "View Full Site",
                "Advertising",
                "NFC Teams",
                "AFC Teams",
            }
            candidates = [c for c in candidates if c not in bad]

            if candidates:
                return max(candidates, key=len)

        return None

    def _parse_nfl_teams_live(self, soup: BeautifulSoup) -> List[TeamRow]:
        """Parse NFL teams from live HTML."""
        rows: List[TeamRow] = []
        seen_urls = set()

        for a in soup.find_all("a", href=True):
            if a.get_text(" ", strip=True).lower() != "view full site":
                continue

            url = a["href"].strip()
            if url.startswith("//"):
                url = "https:" + url
            if not re.match(r"^https?://", url):
                continue

            if url in seen_urls:
                continue
            seen_urls.add(url)

            name = self._extract_team_name_near_link(a)
            if not name:
                continue

            region = self._infer_region(name)
            rows.append(
                TeamRow(
                    name=name,
                    region=region,
                    league="NFL",
                    target_demographic=f"American football fans in and around {region}, plus the broader national NFL audience.",
                    official_url=url,
                    category="NFL",
                )
            )

        rows.sort(key=lambda r: (r.region, r.name))
        return rows

    def _get_nfl_teams_static(self) -> List[TeamRow]:
        """Get NFL teams from static data."""
        return [
            TeamRow(
                name=name,
                region=region,
                league="NFL",
                target_demographic=f"American football fans in and around {region}, plus the broader national NFL audience.",
                official_url=url,
                category="NFL",
            )
            for name, region, url in NFL_TEAMS_STATIC
        ]

    def _write_outputs(
        self, rows: List[TeamRow], json_path: Path, xlsx_path: Path
    ) -> None:
        """Write team data to JSON and Excel files."""
        df = pd.DataFrame([asdict(r) for r in rows])
        df_sorted = df.sort_values(["region", "name"]).reset_index(drop=True)

        # Write JSON
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(
                df_sorted.to_dict(orient="records"), f, ensure_ascii=False, indent=2
            )

        # Write Excel
        with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
            df_sorted.to_excel(writer, index=False, sheet_name="NFL Teams")

    def run(self) -> ScrapeResult:
        """Execute the scrape and return results."""
        start_time = datetime.now()
        used_fallback = False

        try:
            # Try live scraping first
            try:
                soup = self._get_soup(NFL_TEAMS_URL)
                rows = self._parse_nfl_teams_live(soup)

                # If we got too few results, use fallback
                if len(rows) < 28:
                    rows = self._get_nfl_teams_static()
                    used_fallback = True
            except Exception:
                rows = self._get_nfl_teams_static()
                used_fallback = True

            # Generate output paths with timestamp
            timestamp = start_time.strftime("%Y%m%d_%H%M%S")
            json_path = self.output_dir / f"nfl_teams_{timestamp}.json"
            xlsx_path = self.output_dir / f"nfl_teams_{timestamp}.xlsx"

            # Write outputs
            self._write_outputs(rows, json_path, xlsx_path)

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            return ScrapeResult(
                success=True,
                teams_count=len(rows),
                nfl_count=len(rows),
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
                nfl_count=0,
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
                error=str(e),
                used_fallback=used_fallback,
            )

    def get_latest_data(self) -> Optional[List[Dict[str, Any]]]:
        """Get the most recent scraped data."""
        json_files = sorted(self.output_dir.glob("nfl_teams_*.json"), reverse=True)
        if not json_files:
            return None

        with open(json_files[0], "r", encoding="utf-8") as f:
            return json.load(f)
