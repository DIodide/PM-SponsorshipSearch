"""
NBA + NBA G League Teams Scraper
- Scrapes team data from official NBA team directory pages
- Outputs JSON and Excel files with team data
- Enriches with logo URLs from NBA CDN and G League directory
- Tracks data sources for provenance
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import requests
from bs4 import BeautifulSoup

from .logo_utils import (
    fetch_espn_logos,
    fetch_gleague_logos,
    nba_cdn_logo,
    NBA_TEAM_IDS,
    _norm_name,
)
from .source_collector import SourceCollector, SourceNames, SourceTypes


NBA_TEAMS_URL = "https://www.nba.com/teams"
GLEAGUE_TEAMS_URL = "https://gleague.nba.com/teams"

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

# Static NBA teams data as fallback (30 teams)
NBA_TEAMS_STATIC = [
    ("Atlanta Hawks", "Atlanta", "/hawks/"),
    ("Boston Celtics", "Boston", "/celtics/"),
    ("Brooklyn Nets", "Brooklyn", "/nets/"),
    ("Charlotte Hornets", "Charlotte", "/hornets/"),
    ("Chicago Bulls", "Chicago", "/bulls/"),
    ("Cleveland Cavaliers", "Cleveland", "/cavaliers/"),
    ("Dallas Mavericks", "Dallas", "/mavericks/"),
    ("Denver Nuggets", "Denver", "/nuggets/"),
    ("Detroit Pistons", "Detroit", "/pistons/"),
    ("Golden State Warriors", "San Francisco", "/warriors/"),
    ("Houston Rockets", "Houston", "/rockets/"),
    ("Indiana Pacers", "Indianapolis", "/pacers/"),
    ("LA Clippers", "Los Angeles", "/clippers/"),
    ("Los Angeles Lakers", "Los Angeles", "/lakers/"),
    ("Memphis Grizzlies", "Memphis", "/grizzlies/"),
    ("Miami Heat", "Miami", "/heat/"),
    ("Milwaukee Bucks", "Milwaukee", "/bucks/"),
    ("Minnesota Timberwolves", "Minneapolis", "/timberwolves/"),
    ("New Orleans Pelicans", "New Orleans", "/pelicans/"),
    ("New York Knicks", "New York", "/knicks/"),
    ("Oklahoma City Thunder", "Oklahoma City", "/thunder/"),
    ("Orlando Magic", "Orlando", "/magic/"),
    ("Philadelphia 76ers", "Philadelphia", "/sixers/"),
    ("Phoenix Suns", "Phoenix", "/suns/"),
    ("Portland Trail Blazers", "Portland", "/blazers/"),
    ("Sacramento Kings", "Sacramento", "/kings/"),
    ("San Antonio Spurs", "San Antonio", "/spurs/"),
    ("Toronto Raptors", "Toronto", "/raptors/"),
    ("Utah Jazz", "Salt Lake City", "/jazz/"),
    ("Washington Wizards", "Washington", "/wizards/"),
]

# Static G League teams data as fallback
GLEAGUE_TEAMS_STATIC = [
    ("Austin Spurs", "Austin", "https://austin.gleague.nba.com/"),
    ("Birmingham Squadron", "Birmingham", "https://birmingham.gleague.nba.com/"),
    ("Capital City Go-Go", "Washington", "https://capitalcity.gleague.nba.com/"),
    ("Cleveland Charge", "Cleveland", "https://cleveland.gleague.nba.com/"),
    ("College Park Skyhawks", "College Park", "https://collegepark.gleague.nba.com/"),
    ("Delaware Blue Coats", "Wilmington", "https://delaware.gleague.nba.com/"),
    ("Grand Rapids Gold", "Grand Rapids", "https://grandrapids.gleague.nba.com/"),
    ("Greensboro Swarm", "Greensboro", "https://greensboro.gleague.nba.com/"),
    ("Indiana Mad Ants", "Indianapolis", "https://indiana.gleague.nba.com/"),
    ("Iowa Wolves", "Des Moines", "https://iowa.gleague.nba.com/"),
    ("Lakeland Magic", "Lakeland", "https://lakeland.gleague.nba.com/"),
    ("Long Island Nets", "Long Island", "https://longisland.gleague.nba.com/"),
    ("Maine Celtics", "Portland", "https://maine.gleague.nba.com/"),
    ("Memphis Hustle", "Memphis", "https://memphis.gleague.nba.com/"),
    ("Mexico City Capitanes", "Mexico City", "https://mexicocity.gleague.nba.com/"),
    ("Motor City Cruise", "Detroit", "https://motorcity.gleague.nba.com/"),
    ("Oklahoma City Blue", "Oklahoma City", "https://oklahomacity.gleague.nba.com/"),
    ("Ontario Clippers", "Ontario", "https://ontario.gleague.nba.com/"),
    ("Osceola Magic", "Kissimmee", "https://osceola.gleague.nba.com/"),
    ("Raptors 905", "Mississauga", "https://raptors905.gleague.nba.com/"),
    ("Rio Grande Valley Vipers", "Edinburg", "https://riograndevalley.gleague.nba.com/"),
    ("Rip City Remix", "Portland", "https://ripcity.gleague.nba.com/"),
    ("Salt Lake City Stars", "Salt Lake City", "https://saltlakecity.gleague.nba.com/"),
    ("San Diego Clippers", "San Diego", "https://sandiego.gleague.nba.com/"),
    ("Santa Cruz Warriors", "Santa Cruz", "https://santacruz.gleague.nba.com/"),
    ("Sioux Falls Skyforce", "Sioux Falls", "https://siouxfalls.gleague.nba.com/"),
    ("South Bay Lakers", "El Segundo", "https://southbay.gleague.nba.com/"),
    ("Stockton Kings", "Stockton", "https://stockton.gleague.nba.com/"),
    ("Texas Legends", "Frisco", "https://texas.gleague.nba.com/"),
    ("Westchester Knicks", "White Plains", "https://westchester.gleague.nba.com/"),
    ("Windy City Bulls", "Hoffman Estates", "https://windycity.gleague.nba.com/"),
    ("Wisconsin Herd", "Oshkosh", "https://wisconsin.gleague.nba.com/"),
]


@dataclass
class NBATeamRow:
    """Internal team row for NBA/G-League scraper."""
    name: str
    region: str
    league: str
    target_demographic: str
    official_url: str
    category: str
    logo_url: Optional[str] = None
    # Source tracking
    sources: Optional[List[Dict[str, Any]]] = None
    field_sources: Optional[Dict[str, List[str]]] = None
    scraped_at: Optional[str] = None


@dataclass
class ScrapeResult:
    success: bool
    teams_count: int
    nba_count: int
    gleague_count: int
    duration_ms: int
    timestamp: str
    json_path: Optional[str] = None
    xlsx_path: Optional[str] = None
    error: Optional[str] = None
    used_fallback: bool = False


class NBAGLeagueScraper:
    """Scraper for NBA and G League teams."""
    
    name = "NBA & G League Teams"
    description = "Scrapes team data from NBA.com and G League official directories."
    source_url = "https://www.nba.com/teams"
    
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
    
    def _infer_nba_region(self, team_name: str) -> str:
        """Extract region/city from team name."""
        prefixes = [
            "Los Angeles", "New Orleans", "Oklahoma City", "San Antonio",
            "Golden State", "New York",
        ]
        if team_name.startswith("LA "):
            return "Los Angeles"
        for p in prefixes:
            if team_name.startswith(p + " "):
                return p
        return team_name.split()[0] if team_name else ""
    
    def _parse_nba_teams_live(
        self, 
        soup: BeautifulSoup, 
        scrape_timestamp: Optional[str] = None
    ) -> List[NBATeamRow]:
        """Parse NBA teams from live HTML with source tracking."""
        team_links = {}
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            text = a.get_text(" ", strip=True)
            
            if not text or not re.fullmatch(r"/[a-z0-9-]+/", href):
                continue
            
            lower = text.lower()
            if lower in {"profile", "stats", "schedule", "tickets", "roster", "news"}:
                continue
            
            team_links[href] = text
        
        rows: List[NBATeamRow] = []
        for href, name in sorted(team_links.items(), key=lambda x: x[1]):
            region = self._infer_nba_region(name)
            
            # Create source collector for this team
            sources = SourceCollector(name)
            sources.add_website_source(
                url=NBA_TEAMS_URL,
                source_name=SourceNames.NBA_COM,
                fields=["name", "region", "league", "target_demographic", "official_url", "category"]
            )
            
            rows.append(
                NBATeamRow(
                    name=name,
                    region=region,
                    league="National Basketball Association",  # Descriptive name
                    target_demographic=f"Basketball fans in and around {region}, plus the broader NBA audience.",
                    official_url=f"https://www.nba.com{href}",
                    category="NBA",  # Acronym
                    sources=sources.get_sources(),
                    field_sources=sources.get_field_sources(),
                    scraped_at=scrape_timestamp,
                )
            )
        return rows
    
    def _get_nba_teams_static(self, scrape_timestamp: Optional[str] = None) -> List[NBATeamRow]:
        """Get NBA teams from static data with source tracking."""
        rows = []
        for name, region, slug in NBA_TEAMS_STATIC:
            # Create source collector for static data
            sources = SourceCollector(name)
            sources.add_static_source(
                identifier="nba-teams-static-data",
                source_name=SourceNames.STATIC_TEAM_DATA,
                fields=["name", "region", "league", "target_demographic", "official_url", "category"]
            )
            
            rows.append(
                NBATeamRow(
                    name=name,
                    region=region,
                    league="National Basketball Association",  # Descriptive name
                    target_demographic=f"Basketball fans in and around {region}, plus the broader NBA audience.",
                    official_url=f"https://www.nba.com{slug}",
                    category="NBA",  # Acronym
                    sources=sources.get_sources(),
                    field_sources=sources.get_field_sources(),
                    scraped_at=scrape_timestamp,
                )
            )
        return rows
    
    def _get_gleague_teams_static(self, scrape_timestamp: Optional[str] = None) -> List[NBATeamRow]:
        """Get G League teams from static data with source tracking."""
        rows = []
        for name, region, url in GLEAGUE_TEAMS_STATIC:
            # Create source collector for static data
            sources = SourceCollector(name)
            sources.add_static_source(
                identifier="gleague-teams-static-data",
                source_name=SourceNames.STATIC_TEAM_DATA,
                fields=["name", "region", "league", "target_demographic", "official_url", "category"]
            )
            
            rows.append(
                NBATeamRow(
                    name=name,
                    region=region,
                    league="NBA G League",
                    target_demographic=f"Local basketball fans and player-development followers in and around {region}.",
                    official_url=url,
                    category="G League",
                    sources=sources.get_sources(),
                    field_sources=sources.get_field_sources(),
                    scraped_at=scrape_timestamp,
                )
            )
        return rows
    
    def _parse_gleague_teams_live(
        self, 
        soup: BeautifulSoup, 
        nba_names: set, 
        scrape_timestamp: Optional[str] = None
    ) -> List[NBATeamRow]:
        """Parse G League teams from live HTML with source tracking."""
        subdomain_links = {}
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            text = a.get_text(" ", strip=True)
            
            m = re.match(r"^https?://([a-z0-9]+)\.gleague\.nba\.com/?$", href)
            if m and text:
                subdomain_links[href.rstrip("/") + "/"] = text
        
        rows: List[NBATeamRow] = []
        for url, label in sorted(subdomain_links.items(), key=lambda x: x[1]):
            team_name = self._split_gleague_text(label, nba_names)
            region = self._infer_gleague_region(team_name)
            
            # Create source collector for this team
            sources = SourceCollector(team_name)
            sources.add_website_source(
                url=GLEAGUE_TEAMS_URL,
                source_name=SourceNames.GLEAGUE_DIRECTORY,
                fields=["name", "region", "league", "target_demographic", "official_url", "category"]
            )
            
            rows.append(
                NBATeamRow(
                    name=team_name,
                    region=region,
                    league="NBA G League",
                    target_demographic=f"Local basketball fans and player-development followers in and around {region}.",
                    official_url=url,
                    category="G League",
                    sources=sources.get_sources(),
                    field_sources=sources.get_field_sources(),
                    scraped_at=scrape_timestamp,
                )
            )
        return rows
    
    def _split_gleague_text(self, text: str, nba_names: set) -> str:
        """Remove NBA affiliate name suffix from G League team name."""
        team_name = text.strip()
        for nba_name in sorted(nba_names, key=len, reverse=True):
            if team_name.endswith(" " + nba_name):
                team_name = team_name[: -(len(nba_name) + 1)].strip()
                break
        return team_name
    
    def _infer_gleague_region(self, team_name: str) -> str:
        """Extract region from G League team name."""
        prefixes = [
            "Rio Grande Valley", "Salt Lake City", "Oklahoma City", "Mexico City",
            "San Diego", "Santa Cruz", "Sioux Falls", "South Bay", "Long Island",
            "Grand Rapids", "Capital City", "College Park", "Motor City", "Rip City",
        ]
        for p in prefixes:
            if team_name.startswith(p + " "):
                return p
        return team_name.split()[0] if team_name else ""
    
    def _write_outputs(self, rows: List[NBATeamRow], json_path: Path, xlsx_path: Path) -> None:
        """Write team data to JSON and Excel files."""
        df = pd.DataFrame([asdict(r) for r in rows])
        
        df_nba = df[df["category"] == "NBA"].sort_values(["region", "name"]).reset_index(drop=True)
        df_gl = df[df["category"] == "G League"].sort_values(["region", "name"]).reset_index(drop=True)
        df_all = df.sort_values(["category", "region", "name"]).reset_index(drop=True)
        
        # Write JSON
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(df_all.to_dict(orient="records"), f, ensure_ascii=False, indent=2)
        
        # Write Excel with multiple sheets
        with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
            df_all.to_excel(writer, index=False, sheet_name="All Teams")
            df_nba.to_excel(writer, index=False, sheet_name="NBA")
            df_gl.to_excel(writer, index=False, sheet_name="G League")
    
    def _enrich_with_logos(self, nba_rows: List[NBATeamRow], gleague_rows: List[NBATeamRow]) -> None:
        """Add logo URLs to team rows with source tracking."""
        # NBA logos from CDN or ESPN
        espn_logos = fetch_espn_logos("nba")
        
        for row in nba_rows:
            norm = _norm_name(row.name)
            team_id = NBA_TEAM_IDS.get(norm)
            if team_id:
                row.logo_url = nba_cdn_logo(team_id)
                # Add logo source
                logo_source = SourceCollector(row.name)
                logo_source.add_api_source(
                    url=f"https://cdn.nba.com/logos/nba/{team_id}/primary/L/logo.svg",
                    source_name="NBA CDN",
                    endpoint="/logos/nba/",
                    fields=["logo_url"]
                )
                if row.sources:
                    row.sources.extend(logo_source.get_sources())
                else:
                    row.sources = logo_source.get_sources()
            elif espn_logos.get(norm):
                row.logo_url = espn_logos[norm]
                # Add ESPN logo source
                logo_source = SourceCollector(row.name)
                logo_source.add_api_source(
                    url=espn_logos[norm],
                    source_name=SourceNames.ESPN_API,
                    fields=["logo_url"]
                )
                if row.sources:
                    row.sources.extend(logo_source.get_sources())
                else:
                    row.sources = logo_source.get_sources()
        
        # G League logos from directory
        gleague_team_dicts = [{"name": r.name, "official_url": r.official_url} for r in gleague_rows]
        gleague_logos = fetch_gleague_logos(gleague_team_dicts)
        
        for row in gleague_rows:
            norm = _norm_name(row.name)
            if norm in gleague_logos:
                row.logo_url = gleague_logos[norm]
                # Add G League logo source
                logo_source = SourceCollector(row.name)
                logo_source.add_website_source(
                    url=row.official_url,
                    source_name=SourceNames.GLEAGUE_DIRECTORY,
                    fields=["logo_url"]
                )
                if row.sources:
                    row.sources.extend(logo_source.get_sources())
                else:
                    row.sources = logo_source.get_sources()

    def run(self) -> ScrapeResult:
        """Execute the scrape and return results."""
        start_time = datetime.now()
        scrape_timestamp = start_time.isoformat()
        used_fallback = False
        
        try:
            # Try live scraping first
            try:
                nba_soup = self._get_soup(NBA_TEAMS_URL)
                nba_rows = self._parse_nba_teams_live(nba_soup, scrape_timestamp)
                
                # If we got too few results, use fallback
                if len(nba_rows) < 25:
                    nba_rows = self._get_nba_teams_static(scrape_timestamp)
                    used_fallback = True
            except Exception:
                nba_rows = self._get_nba_teams_static(scrape_timestamp)
                used_fallback = True
            
            # Try G League live
            try:
                nba_names = {r.name for r in nba_rows}
                gleague_soup = self._get_soup(GLEAGUE_TEAMS_URL)
                gleague_rows = self._parse_gleague_teams_live(gleague_soup, nba_names, scrape_timestamp)
                
                if len(gleague_rows) < 20:
                    gleague_rows = self._get_gleague_teams_static(scrape_timestamp)
                    used_fallback = True
            except Exception:
                gleague_rows = self._get_gleague_teams_static(scrape_timestamp)
                used_fallback = True
            
            # Enrich with logos
            self._enrich_with_logos(nba_rows, gleague_rows)
            
            rows = nba_rows + gleague_rows
            
            # Generate output paths with timestamp
            timestamp = start_time.strftime("%Y%m%d_%H%M%S")
            json_path = self.output_dir / f"nba_gleague_teams_{timestamp}.json"
            xlsx_path = self.output_dir / f"nba_gleague_teams_{timestamp}.xlsx"
            
            # Write outputs
            self._write_outputs(rows, json_path, xlsx_path)
            
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            
            return ScrapeResult(
                success=True,
                teams_count=len(rows),
                nba_count=len(nba_rows),
                gleague_count=len(gleague_rows),
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
                nba_count=0,
                gleague_count=0,
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
                error=str(e),
                used_fallback=used_fallback,
            )
    
    def get_latest_data(self) -> Optional[List[Dict[str, Any]]]:
        """Get the most recent scraped data."""
        json_files = sorted(self.output_dir.glob("nba_gleague_teams_*.json"), reverse=True)
        if not json_files:
            return None
        
        with open(json_files[0], "r", encoding="utf-8") as f:
            return json.load(f)

