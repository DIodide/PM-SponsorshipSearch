"""
Geographic Enricher for team data.

Adds city population data using the Data Commons API.
Supports metro GDP as a future enhancement via BEA.gov API.
"""

from __future__ import annotations

import asyncio
import os
from typing import Dict, List, Optional

import httpx

from .base import BaseEnricher, EnricherConfig, EnricherRegistry
from ..models import TeamRow


# Data Commons API configuration
# Using v1 API which works without authentication
DATA_COMMONS_STAT_URL = "https://api.datacommons.org/stat/value"
DATA_COMMONS_STAT_SERIES_URL = "https://api.datacommons.org/stat/series"

# Population variable DCID
POPULATION_VARIABLE = "Count_Person"


# Mapping of common team regions/cities to Data Commons GeoIDs (FIPS-based)
# Format: geoId/{state_fips}{place_fips} for cities/places
# These are US Census FIPS place codes
CITY_TO_GEOID: Dict[str, str] = {
    # NFL / Major League cities
    "Arizona": "geoId/0455000",  # Phoenix, AZ
    "Atlanta": "geoId/1304000",  # Atlanta, GA
    "Baltimore": "geoId/2404000",  # Baltimore, MD
    "Boston": "geoId/2507000",  # Boston, MA
    "Buffalo": "geoId/3611000",  # Buffalo, NY
    "Carolina": "geoId/3712000",  # Charlotte, NC
    "Charlotte": "geoId/3712000",  # Charlotte, NC
    "Chicago": "geoId/1714000",  # Chicago, IL
    "Cincinnati": "geoId/3915000",  # Cincinnati, OH
    "Cleveland": "geoId/3916000",  # Cleveland, OH
    "Columbus": "geoId/3918000",  # Columbus, OH
    "Dallas": "geoId/4819000",  # Dallas, TX
    "Denver": "geoId/0820000",  # Denver, CO
    "Detroit": "geoId/2622000",  # Detroit, MI
    "Green Bay": "geoId/5531000",  # Green Bay, WI
    "Houston": "geoId/4835000",  # Houston, TX
    "Indianapolis": "geoId/1836003",  # Indianapolis, IN
    "Jacksonville": "geoId/1235000",  # Jacksonville, FL
    "Kansas City": "geoId/2938000",  # Kansas City, MO
    "Las Vegas": "geoId/3240000",  # Las Vegas, NV
    "Los Angeles": "geoId/0644000",  # Los Angeles, CA
    "Miami": "geoId/1245000",  # Miami, FL
    "Milwaukee": "geoId/5553000",  # Milwaukee, WI
    "Minneapolis": "geoId/2743000",  # Minneapolis, MN
    "Minnesota": "geoId/2743000",  # Minneapolis, MN (state name -> city)
    "Nashville": "geoId/4752006",  # Nashville, TN
    "New England": "geoId/2507000",  # Boston, MA (regional -> city)
    "New Orleans": "geoId/2255000",  # New Orleans, LA
    "New York": "geoId/3651000",  # New York City, NY
    "Oakland": "geoId/0653000",  # Oakland, CA
    "Oklahoma City": "geoId/4055000",  # Oklahoma City, OK
    "Orlando": "geoId/1253000",  # Orlando, FL
    "Philadelphia": "geoId/4260000",  # Philadelphia, PA
    "Phoenix": "geoId/0455000",  # Phoenix, AZ
    "Pittsburgh": "geoId/4261000",  # Pittsburgh, PA
    "Portland": "geoId/4159000",  # Portland, OR
    "Raleigh": "geoId/3755000",  # Raleigh, NC
    "Sacramento": "geoId/0664000",  # Sacramento, CA
    "Salt Lake City": "geoId/4967000",  # Salt Lake City, UT
    "San Antonio": "geoId/4865000",  # San Antonio, TX
    "San Diego": "geoId/0666000",  # San Diego, CA
    "San Francisco": "geoId/0667000",  # San Francisco, CA
    "San Jose": "geoId/0668000",  # San Jose, CA
    "Seattle": "geoId/5363000",  # Seattle, WA
    "St. Louis": "geoId/2965000",  # St. Louis, MO
    "Tampa": "geoId/1271000",  # Tampa, FL
    "Tampa Bay": "geoId/1271000",  # Tampa, FL
    "Tennessee": "geoId/4752006",  # Nashville, TN (state name -> city)
    "Washington": "geoId/1150000",  # Washington, DC
    "Washington D.C.": "geoId/1150000",  # Washington, DC
    # Additional NHL / AHL / ECHL cities
    "Anaheim": "geoId/0602000",  # Anaheim, CA
    "Calgary": None,  # Canada - not in US Census
    "Edmonton": None,  # Canada
    "Montreal": None,  # Canada
    "Ottawa": None,  # Canada
    "Toronto": None,  # Canada
    "Vancouver": None,  # Canada
    "Winnipeg": None,  # Canada
    # Additional MLB / MiLB cities
    "Arlington": "geoId/4804000",  # Arlington, TX
    "Bronx": "geoId/3651000",  # Part of NYC
    "Brooklyn": "geoId/3651000",  # Part of NYC
    "Queens": "geoId/3651000",  # Part of NYC
    "St. Petersburg": "geoId/1263000",  # St. Petersburg, FL
    # Minor league cities (common)
    "Akron": "geoId/3901000",  # Akron, OH
    "Albuquerque": "geoId/3502000",  # Albuquerque, NM
    "Allentown": "geoId/4202000",  # Allentown, PA (Lehigh Valley)
    "Austin": "geoId/4805000",  # Austin, TX
    "Binghamton": "geoId/3606607",  # Binghamton, NY
    "Bridgeport": "geoId/0908000",  # Bridgeport, CT
    "Charleston": "geoId/4513330",  # Charleston, SC
    "Chattanooga": "geoId/4714000",  # Chattanooga, TN
    "Colorado Springs": "geoId/0816000",  # Colorado Springs, CO
    "Des Moines": "geoId/1921000",  # Des Moines, IA
    "Durham": "geoId/3719000",  # Durham, NC
    "El Paso": "geoId/4824000",  # El Paso, TX
    "Fresno": "geoId/0627000",  # Fresno, CA
    "Grand Rapids": "geoId/2634000",  # Grand Rapids, MI
    "Gwinnett": "geoId/1335324",  # Lawrenceville, GA (Gwinnett County)
    "Hartford": "geoId/0937000",  # Hartford, CT
    "Henderson": "geoId/3231900",  # Henderson, NV
    "Huntsville": "geoId/0137000",  # Huntsville, AL
    "Iowa": "geoId/1921000",  # Des Moines, IA
    "Jersey City": "geoId/3436000",  # Jersey City, NJ
    "Lakeland": "geoId/1239075",  # Lakeland, FL
    "Lehigh Valley": "geoId/4202000",  # Allentown, PA
    "Louisville": "geoId/2148006",  # Louisville, KY
    "Madison": "geoId/5548000",  # Madison, WI
    "Memphis": "geoId/4748000",  # Memphis, TN
    "Midland": "geoId/4848072",  # Midland, TX
    "Norfolk": "geoId/5157000",  # Norfolk, VA
    "Omaha": "geoId/3137000",  # Omaha, NE
    "Palm Beach": "geoId/1254075",  # West Palm Beach, FL
    "Providence": "geoId/4459000",  # Providence, RI
    "Reading": "geoId/4263624",  # Reading, PA
    "Richmond": "geoId/5167000",  # Richmond, VA
    "Rochester": "geoId/3663000",  # Rochester, NY
    "Round Rock": "geoId/4863500",  # Round Rock, TX
    "San Bernardino": "geoId/0665000",  # San Bernardino, CA
    "Scranton": "geoId/4269000",  # Scranton, PA
    "Springfield": "geoId/2567000",  # Springfield, MA
    "St. Paul": "geoId/2758000",  # St. Paul, MN
    "Sugar Land": "geoId/4870808",  # Sugar Land, TX
    "Syracuse": "geoId/3673000",  # Syracuse, NY
    "Tacoma": "geoId/5370000",  # Tacoma, WA
    "Toledo": "geoId/3977000",  # Toledo, OH
    "Tucson": "geoId/0477000",  # Tucson, AZ
    "Tulsa": "geoId/4075000",  # Tulsa, OK
    "Wichita": "geoId/2079000",  # Wichita, KS
    "Worcester": "geoId/2582000",  # Worcester, MA
}

# Alternative city name mappings (handles variations)
CITY_ALIASES: Dict[str, str] = {
    "D.C.": "Washington D.C.",
    "DC": "Washington D.C.",
    "LA": "Los Angeles",
    "NYC": "New York",
    "NOLA": "New Orleans",
    "Philly": "Philadelphia",
    "The Bay": "San Francisco",
    "Bay Area": "San Francisco",
    "San Francisco Bay Area": "San Francisco",
    "Twin Cities": "Minneapolis",
    "Foxborough": "New England",
    "Foxboro": "New England",
    "East Rutherford": "New York",
    "Glendale": "Phoenix",  # Cardinals stadium
    "Inglewood": "Los Angeles",  # SoFi Stadium
    "Landover": "Washington",  # Commanders stadium
    "Orchard Park": "Buffalo",  # Bills stadium
    "Santa Clara": "San Francisco",  # 49ers stadium
}


@EnricherRegistry.register
class GeoEnricher(BaseEnricher):
    """
    Enricher that adds geographic data to team records.

    Uses the Data Commons API to fetch city population data.

    Fields added:
    - city_population: Population count for the team's city
    - metro_gdp_millions: Metro area GDP (future enhancement)
    """

    name = "Geographic Enricher"
    description = (
        "Adds city population and metro GDP data from Data Commons and BEA APIs"
    )
    fields_added = ["city_population", "metro_gdp_millions"]

    def __init__(self, config: Optional[EnricherConfig] = None):
        """Initialize with optional configuration."""
        super().__init__(config)

        # API key from config or environment
        self.api_key = self.config.api_keys.get("data_commons") or os.environ.get(
            "DATA_COMMONS_API_KEY", ""
        )

        # Cache for population lookups (geo_id -> population)
        self._population_cache: Dict[str, Optional[int]] = {}

        # HTTP client (initialized in _pre_enrich)
        self._client: Optional[httpx.AsyncClient] = None

    def is_available(self) -> bool:
        """Check if the enricher can run (has API key)."""
        # Data Commons API works without an API key (with rate limits)
        # But having a key provides higher quotas
        return True

    async def _pre_enrich(self, teams: List[TeamRow]) -> None:
        """Initialize HTTP client before processing."""
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.config.request_timeout_s)
        )

    async def _post_enrich(self, teams: List[TeamRow]) -> None:
        """Close HTTP client after processing."""
        if self._client:
            await self._client.aclose()
            self._client = None

    def _normalize_city(self, region: str) -> Optional[str]:
        """
        Normalize a region string to a standard city name.

        Handles aliases, variations, and edge cases.
        """
        if not region:
            return None

        # Clean up the input
        cleaned = region.strip()

        # Check direct alias
        if cleaned in CITY_ALIASES:
            cleaned = CITY_ALIASES[cleaned]

        # Check if it's in our mapping
        if cleaned in CITY_TO_GEOID:
            return cleaned

        # Try title case
        title_case = cleaned.title()
        if title_case in CITY_TO_GEOID:
            return title_case

        # Try finding partial match (for cases like "Tampa Bay Rays" region being "Tampa Bay")
        for city_name in CITY_TO_GEOID.keys():
            if city_name.lower() == cleaned.lower():
                return city_name

        return None

    def _get_geo_id(self, region: str) -> Optional[str]:
        """Get the Data Commons GeoID for a region."""
        city = self._normalize_city(region)
        if city:
            return CITY_TO_GEOID.get(city)
        return None

    async def _fetch_population(self, geo_id: str) -> Optional[int]:
        """
        Fetch population for a single GeoID from Data Commons API.

        Uses the v1 stat/value API which works without authentication.
        """
        if geo_id in self._population_cache:
            return self._population_cache[geo_id]

        if not self._client:
            return None

        try:
            # Build the API request using v1 stat/value endpoint
            # Simple GET request: /stat/value?place=geoId/XXX&stat_var=Count_Person
            params = {
                "place": geo_id,
                "stat_var": POPULATION_VARIABLE,
            }

            response = await self._client.get(
                DATA_COMMONS_STAT_URL,
                params=params,
            )
            response.raise_for_status()

            data = response.json()

            # Response format: {"value": 1326087}
            if "value" in data:
                population = int(data["value"])
                self._population_cache[geo_id] = population
                return population

            # No data found
            self._population_cache[geo_id] = None
            return None

        except httpx.HTTPStatusError as e:
            print(f"Data Commons API error for {geo_id}: {e.response.status_code}")
            self._population_cache[geo_id] = None
            return None
        except Exception as e:
            print(f"Error fetching population for {geo_id}: {e}")
            self._population_cache[geo_id] = None
            return None

    async def _enrich_team(self, team: TeamRow) -> bool:
        """
        Enrich a single team with geographic data.

        Args:
            team: TeamRow to enrich (modified in place)

        Returns:
            True if any data was added, False otherwise
        """
        enriched = False

        # Get GeoID for the team's region
        geo_id = self._get_geo_id(team.region)

        if geo_id:
            # Fetch population if not already set
            if team.city_population is None:
                population = await self._fetch_population(geo_id)
                if population is not None:
                    team.city_population = population
                    enriched = True

            # Note: metro_gdp_millions would be fetched from BEA.gov API
            # This is left as a future enhancement
            # if team.metro_gdp_millions is None:
            #     gdp = await self._fetch_metro_gdp(team.region)
            #     if gdp is not None:
            #         team.metro_gdp_millions = gdp
            #         enriched = True

        return enriched

    async def batch_fetch_populations(
        self, geo_ids: List[str]
    ) -> Dict[str, Optional[int]]:
        """
        Fetch populations for multiple GeoIDs concurrently.

        Uses parallel requests since the v1 API doesn't have a batch endpoint.
        Rate limiting is handled by the base enricher's semaphore.
        """
        if not self._client or not geo_ids:
            return {}

        # Filter out already cached values
        to_fetch = [gid for gid in geo_ids if gid not in self._population_cache]

        if not to_fetch:
            return {gid: self._population_cache.get(gid) for gid in geo_ids}

        # Fetch in parallel with gather
        async def fetch_one(geo_id: str) -> None:
            await self._fetch_population(geo_id)

        await asyncio.gather(
            *[fetch_one(gid) for gid in to_fetch], return_exceptions=True
        )

        return {gid: self._population_cache.get(gid) for gid in geo_ids}
