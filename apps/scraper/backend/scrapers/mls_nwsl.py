"""
MLS + NWSL Teams Scraper
- Fetches team data from ESPN API
- Outputs JSON and Excel files with team data
- Tracks data sources for provenance

Naming Convention:
- category: "MLS" or "NWSL" (acronym)
- league: "Major League Soccer" or "National Women's Soccer League" (descriptive)
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


# ESPN API endpoints
ESPN_MLS_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams"
ESPN_NWSL_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.nwsl/teams"

# Static MLS teams data as fallback (current teams as of 2025)
# Format: (name, city/region, official_url)
MLS_TEAMS_STATIC = [
    ("Atlanta United FC", "Atlanta", "https://www.atlutd.com/"),
    ("Austin FC", "Austin", "https://www.austinfc.com/"),
    ("CF Montréal", "Montréal", "https://www.cfmontreal.com/"),
    ("Charlotte FC", "Charlotte", "https://www.charlottefootballclub.com/"),
    ("Chicago Fire FC", "Chicago", "https://www.chicagofirefc.com/"),
    ("Colorado Rapids", "Denver", "https://www.coloradorapids.com/"),
    ("Columbus Crew", "Columbus", "https://www.columbuscrew.com/"),
    ("D.C. United", "Washington", "https://www.dcunited.com/"),
    ("FC Cincinnati", "Cincinnati", "https://www.fccincinnati.com/"),
    ("FC Dallas", "Dallas", "https://www.fcdallas.com/"),
    ("Houston Dynamo FC", "Houston", "https://www.houstondynamofc.com/"),
    ("Inter Miami CF", "Miami", "https://www.intermiamicf.com/"),
    ("LA Galaxy", "Los Angeles", "https://www.lagalaxy.com/"),
    ("Los Angeles FC", "Los Angeles", "https://www.lafc.com/"),
    ("Minnesota United FC", "Minneapolis", "https://www.mnufc.com/"),
    ("Nashville SC", "Nashville", "https://www.nashvillesc.com/"),
    ("New England Revolution", "Boston", "https://www.revolutionsoccer.net/"),
    ("New York City FC", "New York", "https://www.nycfc.com/"),
    ("New York Red Bulls", "New York", "https://www.newyorkredbulls.com/"),
    ("Orlando City SC", "Orlando", "https://www.orlandocitysc.com/"),
    ("Philadelphia Union", "Philadelphia", "https://www.philadelphiaunion.com/"),
    ("Portland Timbers", "Portland", "https://www.timbers.com/"),
    ("Real Salt Lake", "Salt Lake City", "https://www.rsl.com/"),
    ("San Diego FC", "San Diego", "https://www.sandiegofc.com/"),
    ("San Jose Earthquakes", "San Jose", "https://www.sjearthquakes.com/"),
    ("Seattle Sounders FC", "Seattle", "https://www.soundersfc.com/"),
    ("Sporting Kansas City", "Kansas City", "https://www.sportingkc.com/"),
    ("St. Louis CITY SC", "St. Louis", "https://www.stlcitysc.com/"),
    ("Toronto FC", "Toronto", "https://www.torontofc.ca/"),
    ("Vancouver Whitecaps FC", "Vancouver", "https://www.whitecapsfc.com/"),
]

# Static NWSL teams data as fallback (current teams as of 2025)
NWSL_TEAMS_STATIC = [
    ("Angel City FC", "Los Angeles", "https://www.angelcity.com/"),
    ("Bay FC", "San Francisco", "https://www.bayfc.com/"),
    ("Boston Legacy FC", "Boston", "https://www.bostonlegacyfc.com/"),
    ("Chicago Red Stars", "Chicago", "https://www.chicagoredstars.com/"),
    ("Houston Dash", "Houston", "https://www.houstondash.com/"),
    ("Kansas City Current", "Kansas City", "https://www.kansascitycurrent.com/"),
    ("NC Courage", "Raleigh", "https://www.nccourage.com/"),
    ("NJ/NY Gotham FC", "New York", "https://www.gothamfc.com/"),
    ("Orlando Pride", "Orlando", "https://www.orlandopride.com/"),
    ("Portland Thorns FC", "Portland", "https://www.timbers.com/thornsfc"),
    ("Racing Louisville FC", "Louisville", "https://www.racingloufc.com/"),
    ("San Diego Wave FC", "San Diego", "https://sandiegowavefc.com/"),
    ("Seattle Reign FC", "Seattle", "https://www.reignfc.com/"),
    ("Utah Royals FC", "Salt Lake City", "https://www.rsl.com/utahroyals"),
    ("Washington Spirit", "Washington", "https://www.washingtonspirit.com/"),
]


@dataclass
class SoccerTeamRow:
    """Internal team row for MLS/NWSL scraper."""
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
    mls_count: int
    nwsl_count: int
    duration_ms: int
    timestamp: str
    json_path: Optional[str] = None
    xlsx_path: Optional[str] = None
    error: Optional[str] = None
    used_fallback: bool = False


class MLSNWSLScraper:
    """Scraper for MLS and NWSL teams using ESPN API."""

    name = "MLS & NWSL Teams"
    description = "Fetches team data from ESPN API for MLS and NWSL teams."
    source_url = ESPN_MLS_URL

    def __init__(self, output_dir: Path | str = "data"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    # Known MLS/NWSL city mappings (most reliable source)
    # Includes both official names and ESPN API variations
    TEAM_CITY_MAP = {
        # MLS (official and ESPN variations)
        "Atlanta United FC": "Atlanta",
        "Austin FC": "Austin",
        "CF Montréal": "Montréal",
        "Charlotte FC": "Charlotte",
        "Chicago Fire FC": "Chicago",
        "Colorado Rapids": "Denver",
        "Columbus Crew": "Columbus",
        "D.C. United": "Washington",
        "FC Cincinnati": "Cincinnati",
        "FC Dallas": "Dallas",
        "Houston Dynamo FC": "Houston",
        "Houston Dynamo": "Houston",
        "Inter Miami CF": "Miami",
        "LA Galaxy": "Los Angeles",
        "Los Angeles FC": "Los Angeles",
        "LAFC": "Los Angeles",  # ESPN variation
        "Minnesota United FC": "Minneapolis",
        "Nashville SC": "Nashville",
        "New England Revolution": "Boston",
        "New York City FC": "New York",
        "New York Red Bulls": "New York",
        "Orlando City SC": "Orlando",
        "Philadelphia Union": "Philadelphia",
        "Portland Timbers": "Portland",
        "Real Salt Lake": "Salt Lake City",
        "San Diego FC": "San Diego",
        "San Jose Earthquakes": "San Jose",
        "Seattle Sounders FC": "Seattle",
        "Sporting Kansas City": "Kansas City",
        "St. Louis CITY SC": "St. Louis",
        "St. Louis City SC": "St. Louis",
        "Toronto FC": "Toronto",
        "Vancouver Whitecaps FC": "Vancouver",
        "Vancouver Whitecaps": "Vancouver",  # ESPN variation
        # NWSL (official and ESPN variations)
        "Angel City FC": "Los Angeles",
        "Bay FC": "San Francisco",
        "Boston Legacy FC": "Boston",
        "Chicago Red Stars": "Chicago",
        "Chicago Stars FC": "Chicago",
        "Denver Summit FC": "Denver",
        "Houston Dash": "Houston",
        "Kansas City Current": "Kansas City",
        "NC Courage": "Raleigh",
        "North Carolina Courage": "Raleigh",
        "NJ/NY Gotham FC": "New York",
        "Gotham FC": "New York",  # ESPN variation
        "Orlando Pride": "Orlando",
        "Portland Thorns FC": "Portland",
        "Racing Louisville FC": "Louisville",
        "San Diego Wave FC": "San Diego",
        "Seattle Reign FC": "Seattle",
        "Utah Royals FC": "Salt Lake City",
        "Utah Royals": "Salt Lake City",  # ESPN variation
        "Washington Spirit": "Washington",
    }

    def _infer_region(self, team_data: dict, fallback_name: str = "") -> str:
        """Extract region from ESPN team data."""
        name = team_data.get("displayName", fallback_name)
        
        # Priority 1: Use our known mapping (most reliable)
        if name in self.TEAM_CITY_MAP:
            return self.TEAM_CITY_MAP[name]
        
        # Priority 2: Check ESPN location field
        location = team_data.get("location", "")
        if location:
            # Skip if it looks like a full team name
            has_suffix = any(s in location for s in [" FC", " SC", " CF", " United", " City"])
            if not has_suffix:
                return location
        
        # Fallback: try to extract from displayName by removing common suffixes
        suffixes = [" FC", " SC", " CF", " United FC", " City FC", " City SC", " United"]
        result = name
        for suffix in sorted(suffixes, key=len, reverse=True):
            if result.endswith(suffix):
                result = result.replace(suffix, "").strip()
                break
        
        return result if result != name else name.split()[0]

    def _generate_official_url(self, team_data: dict, league: str) -> str:
        """Generate official team website URL."""
        # Try ESPN links first
        links = team_data.get("links", [])
        for link in links:
            rel = link.get("rel", [])
            if "clubhouse" in rel:
                return link.get("href", "")
        
        # Fallback: construct from slug
        slug = team_data.get("slug", "")
        if slug:
            if league == "MLS":
                return f"https://www.mlssoccer.com/clubs/{slug}/"
            else:  # NWSL
                return f"https://www.nwslsoccer.com/clubs/{slug}/"
        
        return ""

    def _parse_mls_teams(self, scrape_timestamp: Optional[str] = None) -> List[SoccerTeamRow]:
        """Parse MLS teams from ESPN API with source tracking."""
        espn_teams = fetch_espn_teams("mls")
        
        if not espn_teams:
            return []
        
        rows: List[SoccerTeamRow] = []
        
        for team_data in espn_teams:
            name = team_data.get("displayName", "")
            region = self._infer_region(team_data, name)
            logo_url = team_data.get("logo_url")
            official_url = self._generate_official_url(team_data, "MLS")
            
            # Create source collector for this team
            sources = SourceCollector(name)
            sources.add_api_source(
                url=ESPN_MLS_URL,
                source_name=SourceNames.ESPN_API,
                endpoint="/apis/site/v2/sports/soccer/usa.1/teams",
                fields=["name", "region", "league", "target_demographic", "official_url", "category", "logo_url"]
            )
            
            rows.append(
                SoccerTeamRow(
                    name=name,
                    region=region,
                    league="Major League Soccer",  # Descriptive name
                    target_demographic=f"Soccer fans in and around {region}, plus the broader MLS audience.",
                    official_url=official_url,
                    category="MLS",  # Acronym
                    logo_url=logo_url,
                    sources=sources.get_sources(),
                    field_sources=sources.get_field_sources(),
                    scraped_at=scrape_timestamp,
                )
            )
        
        return rows

    def _parse_nwsl_teams(self, scrape_timestamp: Optional[str] = None) -> List[SoccerTeamRow]:
        """Parse NWSL teams from ESPN API with source tracking."""
        espn_teams = fetch_espn_teams("nwsl")
        
        if not espn_teams:
            return []
        
        rows: List[SoccerTeamRow] = []
        
        for team_data in espn_teams:
            name = team_data.get("displayName", "")
            region = self._infer_region(team_data, name)
            logo_url = team_data.get("logo_url")
            official_url = self._generate_official_url(team_data, "NWSL")
            
            # Create source collector for this team
            sources = SourceCollector(name)
            sources.add_api_source(
                url=ESPN_NWSL_URL,
                source_name=SourceNames.ESPN_API,
                endpoint="/apis/site/v2/sports/soccer/usa.nwsl/teams",
                fields=["name", "region", "league", "target_demographic", "official_url", "category", "logo_url"]
            )
            
            rows.append(
                SoccerTeamRow(
                    name=name,
                    region=region,
                    league="National Women's Soccer League",  # Descriptive name
                    target_demographic=f"Women's soccer fans in and around {region}, plus the broader NWSL audience.",
                    official_url=official_url,
                    category="NWSL",  # Acronym
                    logo_url=logo_url,
                    sources=sources.get_sources(),
                    field_sources=sources.get_field_sources(),
                    scraped_at=scrape_timestamp,
                )
            )
        
        return rows

    def _get_mls_teams_static(self, scrape_timestamp: Optional[str] = None) -> List[SoccerTeamRow]:
        """Get MLS teams from static data with source tracking."""
        espn_logos = fetch_espn_logos("mls")
        
        rows = []
        for name, region, url in MLS_TEAMS_STATIC:
            sources = SourceCollector(name)
            sources.add_static_source(
                identifier="mls-teams-static-data",
                source_name=SourceNames.STATIC_TEAM_DATA,
                fields=["name", "region", "league", "target_demographic", "official_url", "category"]
            )
            
            logo_url = espn_logos.get(_norm_name(name))
            if logo_url:
                sources.add_api_source(
                    url=ESPN_MLS_URL,
                    source_name=SourceNames.ESPN_API,
                    fields=["logo_url"]
                )
            
            rows.append(
                SoccerTeamRow(
                    name=name,
                    region=region,
                    league="Major League Soccer",  # Descriptive name
                    target_demographic=f"Soccer fans in and around {region}, plus the broader MLS audience.",
                    official_url=url,
                    category="MLS",  # Acronym
                    logo_url=logo_url,
                    sources=sources.get_sources(),
                    field_sources=sources.get_field_sources(),
                    scraped_at=scrape_timestamp,
                )
            )
        return rows

    def _get_nwsl_teams_static(self, scrape_timestamp: Optional[str] = None) -> List[SoccerTeamRow]:
        """Get NWSL teams from static data with source tracking."""
        espn_logos = fetch_espn_logos("nwsl")
        
        rows = []
        for name, region, url in NWSL_TEAMS_STATIC:
            sources = SourceCollector(name)
            sources.add_static_source(
                identifier="nwsl-teams-static-data",
                source_name=SourceNames.STATIC_TEAM_DATA,
                fields=["name", "region", "league", "target_demographic", "official_url", "category"]
            )
            
            logo_url = espn_logos.get(_norm_name(name))
            if logo_url:
                sources.add_api_source(
                    url=ESPN_NWSL_URL,
                    source_name=SourceNames.ESPN_API,
                    fields=["logo_url"]
                )
            
            rows.append(
                SoccerTeamRow(
                    name=name,
                    region=region,
                    league="National Women's Soccer League",  # Descriptive name
                    target_demographic=f"Women's soccer fans in and around {region}, plus the broader NWSL audience.",
                    official_url=url,
                    category="NWSL",  # Acronym
                    logo_url=logo_url,
                    sources=sources.get_sources(),
                    field_sources=sources.get_field_sources(),
                    scraped_at=scrape_timestamp,
                )
            )
        return rows

    def _write_outputs(self, rows: List[SoccerTeamRow], json_path: Path, xlsx_path: Path) -> None:
        """Write team data to JSON and Excel files."""
        df = pd.DataFrame([asdict(r) for r in rows])
        
        # Split by category
        df_mls = df[df["category"] == "MLS"].sort_values(["region", "name"]).reset_index(drop=True)
        df_nwsl = df[df["category"] == "NWSL"].sort_values(["region", "name"]).reset_index(drop=True)
        df_all = df.sort_values(["category", "region", "name"]).reset_index(drop=True)

        # Write JSON
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(df_all.to_dict(orient="records"), f, ensure_ascii=False, indent=2)

        # Write Excel with multiple sheets
        with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
            df_all.to_excel(writer, index=False, sheet_name="All Teams")
            df_mls.to_excel(writer, index=False, sheet_name="MLS")
            df_nwsl.to_excel(writer, index=False, sheet_name="NWSL")

    def run(self) -> ScrapeResult:
        """Execute the scrape and return results."""
        start_time = datetime.now()
        scrape_timestamp = start_time.isoformat()
        used_fallback = False

        try:
            # Fetch MLS teams
            mls_rows = self._parse_mls_teams(scrape_timestamp)
            if len(mls_rows) < 25:
                mls_rows = self._get_mls_teams_static(scrape_timestamp)
                used_fallback = True

            # Fetch NWSL teams
            nwsl_rows = self._parse_nwsl_teams(scrape_timestamp)
            if len(nwsl_rows) < 10:
                nwsl_rows = self._get_nwsl_teams_static(scrape_timestamp)
                used_fallback = True

            rows = mls_rows + nwsl_rows

            # Generate output paths with timestamp
            timestamp = start_time.strftime("%Y%m%d_%H%M%S")
            json_path = self.output_dir / f"mls_nwsl_teams_{timestamp}.json"
            xlsx_path = self.output_dir / f"mls_nwsl_teams_{timestamp}.xlsx"

            # Write outputs
            self._write_outputs(rows, json_path, xlsx_path)

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            return ScrapeResult(
                success=True,
                teams_count=len(rows),
                mls_count=len(mls_rows),
                nwsl_count=len(nwsl_rows),
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
                mls_count=0,
                nwsl_count=0,
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
                error=str(e),
                used_fallback=used_fallback,
            )

    def get_latest_data(self) -> Optional[List[Dict[str, Any]]]:
        """Get the most recent scraped data."""
        json_files = sorted(self.output_dir.glob("mls_nwsl_teams_*.json"), reverse=True)
        if not json_files:
            return None

        with open(json_files[0], "r", encoding="utf-8") as f:
            return json.load(f)
