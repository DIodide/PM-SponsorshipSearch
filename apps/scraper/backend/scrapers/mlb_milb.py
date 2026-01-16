"""
MLB + MiLB Teams Scraper
- Pulls teams from MLB StatsAPI: https://statsapi.mlb.com/api/v1/teams
- Outputs JSON and Excel files with team data
- Enriches with logo URLs from MLB Static CDN
- Generates proper website URLs for mlb.com and milb.com
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

from .logo_utils import mlbstatic_logo, fetch_espn_logos, _norm_name


MLB_STATSAPI_TEAMS_URL = "https://statsapi.mlb.com/api/v1/teams"

# Sport IDs: MLB(1), AAA(11), AA(12), High-A(13), A(14), Rookie(16)
DEFAULT_SPORT_IDS = [1, 11, 12, 13, 14, 16]

# =============================================================================
# MLB TEAM ID TO WEBSITE SLUG MAPPING
# =============================================================================
# MLB.com URLs don't follow a predictable pattern from API data,
# so we maintain an explicit mapping from team_id to URL slug.
# Format: team_id -> slug (used as https://www.mlb.com/{slug})
# =============================================================================
MLB_TEAM_SLUGS: Dict[int, str] = {
    # American League
    108: "angels",           # Los Angeles Angels
    109: "dbacks",           # Arizona Diamondbacks
    110: "orioles",          # Baltimore Orioles
    111: "redsox",           # Boston Red Sox
    112: "cubs",             # Chicago Cubs
    113: "reds",             # Cincinnati Reds
    114: "guardians",        # Cleveland Guardians
    115: "rockies",          # Colorado Rockies
    116: "tigers",           # Detroit Tigers
    117: "astros",           # Houston Astros
    118: "royals",           # Kansas City Royals
    119: "dodgers",          # Los Angeles Dodgers
    120: "nationals",        # Washington Nationals
    121: "mets",             # New York Mets
    133: "athletics",        # Oakland Athletics (moved to Sacramento/Vegas)
    134: "pirates",          # Pittsburgh Pirates
    135: "padres",           # San Diego Padres
    136: "mariners",         # Seattle Mariners
    137: "giants",           # San Francisco Giants
    138: "cardinals",        # St. Louis Cardinals
    139: "rays",             # Tampa Bay Rays
    140: "rangers",          # Texas Rangers
    141: "bluejays",         # Toronto Blue Jays
    142: "twins",            # Minnesota Twins
    143: "phillies",         # Philadelphia Phillies
    144: "braves",           # Atlanta Braves
    145: "whitesox",         # Chicago White Sox
    146: "marlins",          # Miami Marlins
    147: "yankees",          # New York Yankees
    158: "brewers",          # Milwaukee Brewers
}


@dataclass
class TeamRow:
    name: str
    region: str
    league: str
    target_demographic: str
    official_url: str
    category: str
    sport_id: int
    team_id: int
    logo_url: Optional[str] = None


@dataclass
class ScrapeResult:
    success: bool
    teams_count: int
    mlb_count: int
    milb_count: int
    duration_ms: int
    timestamp: str
    json_path: Optional[str] = None
    xlsx_path: Optional[str] = None
    error: Optional[str] = None


class MLBMiLBScraper:
    """Scraper for MLB and MiLB teams using the StatsAPI."""

    name = "MLB & MiLB Teams"
    description = "Fetches team data from MLB StatsAPI including MLB and all affiliated minor league teams."
    source_url = "https://statsapi.mlb.com/api/v1/teams"

    def __init__(self, output_dir: Path | str = "data"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.sport_ids = DEFAULT_SPORT_IDS

    def fetch_teams(self, timeout_s: int = 30) -> List[Dict[str, Any]]:
        """Fetch raw team data from StatsAPI for each sport ID."""
        all_teams = []
        for sport_id in self.sport_ids:
            try:
                url = f"{MLB_STATSAPI_TEAMS_URL}?sportId={sport_id}"
                response = requests.get(url, timeout=timeout_s)
                response.raise_for_status()
                data = response.json()
                teams = data.get("teams", [])
                all_teams.extend(teams)
            except Exception as e:
                print(f"Warning: Failed to fetch teams for sportId={sport_id}: {e}")
                continue
        return all_teams

    def _generate_website_url(self, team: Dict[str, Any], sport_id: int) -> str:
        """
        Generate the official team website URL.
        
        For MLB teams: Uses the MLB_TEAM_SLUGS mapping to mlb.com
        For MiLB teams: Generates milb.com URL from location name
        """
        team_id = team.get("id", 0)
        
        # MLB teams - use explicit mapping
        if sport_id == 1:
            slug = MLB_TEAM_SLUGS.get(team_id)
            if slug:
                return f"https://www.mlb.com/{slug}"
            # Fallback: try to derive from clubName
            club_name = team.get("clubName", "")
            if club_name:
                slug = club_name.lower().replace(" ", "").replace("-", "")
                return f"https://www.mlb.com/{slug}"
        
        # MiLB teams - derive from location name
        # Pattern: https://www.milb.com/{location-with-dashes}
        location = team.get("locationName", "")
        if location:
            # Convert location to URL slug: "Round Rock" -> "round-rock"
            slug = re.sub(r"[^\w\s-]", "", location.lower())  # Remove special chars
            slug = re.sub(r"\s+", "-", slug.strip())  # Replace spaces with dashes
            return f"https://www.milb.com/{slug}"
        
        # Ultimate fallback - return the API URL
        link = team.get("link") or ""
        return f"https://statsapi.mlb.com{link}" if link else ""

    def _team_to_row(self, team: Dict[str, Any], logo_url: Optional[str] = None) -> TeamRow:
        """Convert raw API team data to structured TeamRow."""
        name = team.get("name", "")
        region = team.get("locationName") or ""
        sport_info = team.get("sport") or {}
        sport_name = sport_info.get("name", "")
        sport_id = sport_info.get("id", 0)
        league_name = (team.get("league") or {}).get("name", "")

        # Build readable league label
        league = f"{sport_name} — {league_name}" if league_name else sport_name

        # Generate target demographic
        target = (
            f"Local baseball fans and families in/around {region}".strip()
            if region
            else "Baseball fans"
        )

        # Generate proper team website URL
        official_url = self._generate_website_url(team, sport_id)

        category = "MLB" if sport_id == 1 else "MiLB"
        team_id = team.get("id", 0)

        return TeamRow(
            name=name,
            region=region,
            league=league,
            target_demographic=target,
            official_url=official_url,
            category=category,
            sport_id=sport_id,
            team_id=team_id,
            logo_url=logo_url,
        )

    def _write_outputs(
        self, rows: List[TeamRow], json_path: Path, xlsx_path: Path
    ) -> None:
        """Write team data to JSON and Excel files."""
        df = pd.DataFrame([asdict(r) for r in rows])

        df_mlb = (
            df[df["category"] == "MLB"]
            .sort_values(["region", "name"])
            .reset_index(drop=True)
        )
        df_milb = (
            df[df["category"] == "MiLB"]
            .sort_values(["league", "region", "name"])
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
            df_mlb.to_excel(writer, index=False, sheet_name="MLB")
            df_milb.to_excel(writer, index=False, sheet_name="MiLB")

    def _fetch_logos(self, teams: List[Dict[str, Any]]) -> Dict[int, str]:
        """Fetch logo URLs for teams using MLB Static CDN."""
        logos: Dict[int, str] = {}
        
        # ESPN fallback for MLB teams
        espn_logos = fetch_espn_logos("mlb")
        
        for team in teams:
            team_id = team.get("id", 0)
            name = team.get("name", "")
            
            if team_id > 0:
                # Use MLB Static CDN URL
                logos[team_id] = mlbstatic_logo(team_id)
        
        return logos

    def run(self) -> ScrapeResult:
        """Execute the scrape and return results."""
        start_time = datetime.now()

        try:
            # Fetch and filter active teams
            teams = self.fetch_teams()
            active_teams = [t for t in teams if t.get("active") is True]

            # Fetch logo URLs
            logo_map = self._fetch_logos(active_teams)

            # Convert to structured rows with logos
            rows = [
                self._team_to_row(t, logo_map.get(t.get("id", 0)))
                for t in active_teams
            ]

            # Count by category
            mlb_count = sum(1 for r in rows if r.category == "MLB")
            milb_count = sum(1 for r in rows if r.category == "MiLB")

            # Generate output paths with timestamp
            timestamp = start_time.strftime("%Y%m%d_%H%M%S")
            json_path = self.output_dir / f"mlb_milb_teams_{timestamp}.json"
            xlsx_path = self.output_dir / f"mlb_milb_teams_{timestamp}.xlsx"

            # Write outputs
            self._write_outputs(rows, json_path, xlsx_path)

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            return ScrapeResult(
                success=True,
                teams_count=len(rows),
                mlb_count=mlb_count,
                milb_count=milb_count,
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
                json_path=str(json_path),
                xlsx_path=str(xlsx_path),
            )

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            return ScrapeResult(
                success=False,
                teams_count=0,
                mlb_count=0,
                milb_count=0,
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
                error=str(e),
            )

    def get_latest_data(self) -> Optional[List[Dict[str, Any]]]:
        """Get the most recent scraped data."""
        json_files = sorted(self.output_dir.glob("mlb_milb_teams_*.json"), reverse=True)
        if not json_files:
            return None

        with open(json_files[0], "r", encoding="utf-8") as f:
            return json.load(f)
