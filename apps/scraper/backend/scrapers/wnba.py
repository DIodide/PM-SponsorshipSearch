"""
WNBA Teams Scraper
- Fetches team data from ESPN API
- Outputs JSON and Excel files with team data
- Tracks data sources for provenance

Naming Convention:
- category: "WNBA" (acronym)
- league: "Women's National Basketball Association" (descriptive)
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

from .logo_utils import fetch_espn_teams, fetch_espn_logos, _norm_name
from .source_collector import SourceCollector, SourceNames, SourceTypes


# ESPN API endpoint for WNBA
ESPN_WNBA_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams"

# Static WNBA teams data as fallback (current teams as of 2025)
# Format: (name, city/region, official_url)
WNBA_TEAMS_STATIC = [
    # Eastern Conference
    ("Atlanta Dream", "Atlanta", "https://dream.wnba.com/"),
    ("Chicago Sky", "Chicago", "https://sky.wnba.com/"),
    ("Connecticut Sun", "Connecticut", "https://sun.wnba.com/"),
    ("Indiana Fever", "Indiana", "https://fever.wnba.com/"),
    ("New York Liberty", "New York", "https://liberty.wnba.com/"),
    ("Washington Mystics", "Washington", "https://mystics.wnba.com/"),
    # Western Conference
    ("Dallas Wings", "Dallas", "https://wings.wnba.com/"),
    ("Golden State Valkyries", "San Francisco", "https://valkyries.wnba.com/"),
    ("Las Vegas Aces", "Las Vegas", "https://aces.wnba.com/"),
    ("Los Angeles Sparks", "Los Angeles", "https://sparks.wnba.com/"),
    ("Minnesota Lynx", "Minnesota", "https://lynx.wnba.com/"),
    ("Phoenix Mercury", "Phoenix", "https://mercury.wnba.com/"),
    ("Seattle Storm", "Seattle", "https://storm.wnba.com/"),
]


@dataclass
class WNBATeamRow:
    """Internal team row for WNBA scraper."""
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
    wnba_count: int
    duration_ms: int
    timestamp: str
    json_path: Optional[str] = None
    xlsx_path: Optional[str] = None
    error: Optional[str] = None
    used_fallback: bool = False


class WNBAScraper:
    """Scraper for WNBA teams using ESPN API."""

    name = "WNBA Teams"
    description = "Fetches team data from ESPN API for WNBA teams."
    source_url = ESPN_WNBA_URL

    def __init__(self, output_dir: Path | str = "data"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _infer_region(self, team_data: dict) -> str:
        """Extract region from ESPN team data."""
        # ESPN provides 'location' field which is typically the city/region
        location = team_data.get("location", "")
        if location:
            return location
        
        # Fallback: try to extract from displayName
        name = team_data.get("displayName", "")
        # Common multi-word regions
        prefixes = ["Los Angeles", "Las Vegas", "New York", "Golden State", "San Francisco"]
        for p in prefixes:
            if name.startswith(p + " "):
                return p
        
        # Otherwise take everything except the last word (team name)
        parts = name.split()
        if len(parts) >= 2:
            return " ".join(parts[:-1])
        return name

    def _generate_official_url(self, team_data: dict) -> str:
        """Generate official team website URL."""
        slug = team_data.get("slug", "")
        if slug:
            # WNBA team URLs follow pattern: https://{slug}.wnba.com/
            return f"https://{slug.replace('-', '')}.wnba.com/"
        
        # Fallback: use ESPN links
        links = team_data.get("links", [])
        for link in links:
            if link.get("rel") and "clubhouse" in link.get("rel", []):
                return link.get("href", "")
        
        return ""

    def _parse_espn_teams(self, scrape_timestamp: Optional[str] = None) -> List[WNBATeamRow]:
        """Parse WNBA teams from ESPN API with source tracking."""
        espn_teams = fetch_espn_teams("wnba")
        
        if not espn_teams:
            return []
        
        rows: List[WNBATeamRow] = []
        
        for team_data in espn_teams:
            name = team_data.get("displayName", "")
            region = self._infer_region(team_data)
            logo_url = team_data.get("logo_url")
            official_url = self._generate_official_url(team_data)
            
            # Create source collector for this team
            sources = SourceCollector(name)
            sources.add_api_source(
                url=ESPN_WNBA_URL,
                source_name=SourceNames.ESPN_API,
                endpoint="/apis/site/v2/sports/basketball/wnba/teams",
                fields=["name", "region", "league", "target_demographic", "official_url", "category", "logo_url"]
            )
            
            rows.append(
                WNBATeamRow(
                    name=name,
                    region=region,
                    league="Women's National Basketball Association",  # Descriptive name
                    target_demographic=f"Women's basketball fans in and around {region}, plus the broader WNBA audience.",
                    official_url=official_url,
                    category="WNBA",  # Acronym
                    logo_url=logo_url,
                    sources=sources.get_sources(),
                    field_sources=sources.get_field_sources(),
                    scraped_at=scrape_timestamp,
                )
            )
        
        return rows

    def _get_teams_static(self, scrape_timestamp: Optional[str] = None) -> List[WNBATeamRow]:
        """Get WNBA teams from static data with source tracking."""
        # Get logos from ESPN as fallback
        espn_logos = fetch_espn_logos("wnba")
        
        rows = []
        for name, region, url in WNBA_TEAMS_STATIC:
            # Create source collector for static data
            sources = SourceCollector(name)
            sources.add_static_source(
                identifier="wnba-teams-static-data",
                source_name=SourceNames.STATIC_TEAM_DATA,
                fields=["name", "region", "league", "target_demographic", "official_url", "category"]
            )
            
            # Try to get logo from ESPN
            logo_url = espn_logos.get(_norm_name(name))
            if logo_url:
                sources.add_api_source(
                    url=ESPN_WNBA_URL,
                    source_name=SourceNames.ESPN_API,
                    fields=["logo_url"]
                )
            
            rows.append(
                WNBATeamRow(
                    name=name,
                    region=region,
                    league="Women's National Basketball Association",  # Descriptive name
                    target_demographic=f"Women's basketball fans in and around {region}, plus the broader WNBA audience.",
                    official_url=url,
                    category="WNBA",  # Acronym
                    logo_url=logo_url,
                    sources=sources.get_sources(),
                    field_sources=sources.get_field_sources(),
                    scraped_at=scrape_timestamp,
                )
            )
        return rows

    def _write_outputs(self, rows: List[WNBATeamRow], json_path: Path, xlsx_path: Path) -> None:
        """Write team data to JSON and Excel files."""
        df = pd.DataFrame([asdict(r) for r in rows])
        df_sorted = df.sort_values(["region", "name"]).reset_index(drop=True)

        # Write JSON
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(df_sorted.to_dict(orient="records"), f, ensure_ascii=False, indent=2)

        # Write Excel
        with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
            df_sorted.to_excel(writer, index=False, sheet_name="WNBA Teams")

    def run(self) -> ScrapeResult:
        """Execute the scrape and return results."""
        start_time = datetime.now()
        scrape_timestamp = start_time.isoformat()
        used_fallback = False

        try:
            # Try ESPN API first
            rows = self._parse_espn_teams(scrape_timestamp)
            
            # If we got too few results, use fallback
            if len(rows) < 10:
                rows = self._get_teams_static(scrape_timestamp)
                used_fallback = True

            # Generate output paths with timestamp
            timestamp = start_time.strftime("%Y%m%d_%H%M%S")
            json_path = self.output_dir / f"wnba_teams_{timestamp}.json"
            xlsx_path = self.output_dir / f"wnba_teams_{timestamp}.xlsx"

            # Write outputs
            self._write_outputs(rows, json_path, xlsx_path)

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            return ScrapeResult(
                success=True,
                teams_count=len(rows),
                wnba_count=len(rows),
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
                wnba_count=0,
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
                error=str(e),
                used_fallback=used_fallback,
            )

    def get_latest_data(self) -> Optional[List[Dict[str, Any]]]:
        """Get the most recent scraped data."""
        json_files = sorted(self.output_dir.glob("wnba_teams_*.json"), reverse=True)
        if not json_files:
            return None

        with open(json_files[0], "r", encoding="utf-8") as f:
            return json.load(f)
