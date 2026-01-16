"""
Geographic Enricher for team data.

Adds city population data using the Data Commons API.
Supports metro GDP as a future enhancement via BEA.gov API.
"""

from __future__ import annotations

import asyncio
import os
from typing import Dict, List, Optional, Tuple

import httpx

from .base import BaseEnricher, EnricherConfig, EnricherRegistry
from ..models import TeamRow, EnrichmentResult


# Data Commons API configuration
# Using v1 API which works without authentication
DATA_COMMONS_STAT_URL = "https://api.datacommons.org/stat/value"

# Population variable DCID
POPULATION_VARIABLE = "Count_Person"


# =============================================================================
# COMPREHENSIVE REGION TO CITY/GEOID MAPPING
# =============================================================================
# Maps team regions to (city_name, country_code, geo_id)
# geo_id is None for non-US locations (Canada, Dominican Republic, Mexico)
# =============================================================================

REGION_MAPPING: Dict[str, Tuple[str, str, Optional[str]]] = {
    # =========================================================================
    # NFL / MAJOR LEAGUE CITIES (All 30+ cities)
    # =========================================================================
    "Arizona": ("Phoenix", "US", "geoId/0455000"),
    "Atlanta": ("Atlanta", "US", "geoId/1304000"),
    "Baltimore": ("Baltimore", "US", "geoId/2404000"),
    "Boston": ("Boston", "US", "geoId/2507000"),
    "Buffalo": ("Buffalo", "US", "geoId/3611000"),
    "Carolina": ("Charlotte", "US", "geoId/3712000"),
    "Charlotte": ("Charlotte", "US", "geoId/3712000"),
    "Chicago": ("Chicago", "US", "geoId/1714000"),
    "Cincinnati": ("Cincinnati", "US", "geoId/3915000"),
    "Cleveland": ("Cleveland", "US", "geoId/3916000"),
    "Columbus": ("Columbus", "US", "geoId/3918000"),
    "Dallas": ("Dallas", "US", "geoId/4819000"),
    "Denver": ("Denver", "US", "geoId/0820000"),
    "Detroit": ("Detroit", "US", "geoId/2622000"),
    "Green Bay": ("Green Bay", "US", "geoId/5531000"),
    "Houston": ("Houston", "US", "geoId/4835000"),
    "Indianapolis": ("Indianapolis", "US", "geoId/1836003"),
    "Jacksonville": ("Jacksonville", "US", "geoId/1235000"),
    "Kansas City": ("Kansas City", "US", "geoId/2938000"),
    "Las Vegas": ("Las Vegas", "US", "geoId/3240000"),
    "Los Angeles": ("Los Angeles", "US", "geoId/0644000"),
    "Miami": ("Miami", "US", "geoId/1245000"),
    "Milwaukee": ("Milwaukee", "US", "geoId/5553000"),
    "Minneapolis": ("Minneapolis", "US", "geoId/2743000"),
    "Nashville": ("Nashville", "US", "geoId/4752006"),
    "New Orleans": ("New Orleans", "US", "geoId/2255000"),
    "New York": ("New York", "US", "geoId/3651000"),
    "Oakland": ("Oakland", "US", "geoId/0653000"),
    "Oklahoma City": ("Oklahoma City", "US", "geoId/4055000"),
    "Orlando": ("Orlando", "US", "geoId/1253000"),
    "Philadelphia": ("Philadelphia", "US", "geoId/4260000"),
    "Phoenix": ("Phoenix", "US", "geoId/0455000"),
    "Pittsburgh": ("Pittsburgh", "US", "geoId/4261000"),
    "Portland": ("Portland", "US", "geoId/4159000"),
    "Raleigh": ("Raleigh", "US", "geoId/3755000"),
    "Sacramento": ("Sacramento", "US", "geoId/0664000"),
    "Salt Lake City": ("Salt Lake City", "US", "geoId/4967000"),
    "San Antonio": ("San Antonio", "US", "geoId/4865000"),
    "San Diego": ("San Diego", "US", "geoId/0666000"),
    "San Francisco": ("San Francisco", "US", "geoId/0667000"),
    "San Jose": ("San Jose", "US", "geoId/0668000"),
    "Seattle": ("Seattle", "US", "geoId/5363000"),
    "St. Louis": ("St. Louis", "US", "geoId/2965000"),
    "Tampa": ("Tampa", "US", "geoId/1271000"),
    "Tampa Bay": ("Tampa", "US", "geoId/1271000"),
    "Washington": ("Washington", "US", "geoId/1150000"),
    "Washington D.C.": ("Washington", "US", "geoId/1150000"),
    # =========================================================================
    # STATE NAMES -> MAJOR CITY MAPPINGS
    # =========================================================================
    "Colorado": ("Denver", "US", "geoId/0820000"),
    "Florida": ("Miami", "US", "geoId/1245000"),
    "Indiana": ("Indianapolis", "US", "geoId/1836003"),
    "Minnesota": ("Minneapolis", "US", "geoId/2743000"),
    "New England": ("Boston", "US", "geoId/2507000"),
    "New Jersey": ("Newark", "US", "geoId/3451000"),
    "Tennessee": ("Nashville", "US", "geoId/4752006"),
    "Texas": ("Dallas", "US", "geoId/4819000"),
    "Utah": ("Salt Lake City", "US", "geoId/4967000"),
    "Wisconsin": ("Milwaukee", "US", "geoId/5553000"),
    # =========================================================================
    # CANADIAN CITIES (no US Census data)
    # =========================================================================
    "Calgary": ("Calgary", "CA", None),
    "Edmonton": ("Edmonton", "CA", None),
    "Montreal": ("Montreal", "CA", None),
    "Montréal": ("Montreal", "CA", None),
    "Ottawa": ("Ottawa", "CA", None),
    "Toronto": ("Toronto", "CA", None),
    "Vancouver": ("Vancouver", "CA", None),
    "Winnipeg": ("Winnipeg", "CA", None),
    "Abbotsford": ("Abbotsford", "CA", None),
    "Belleville": ("Belleville", "CA", None),
    "Laval": ("Laval", "CA", None),
    "Manitoba": ("Winnipeg", "CA", None),
    "Trois-Rivières": ("Trois-Rivières", "CA", None),
    # =========================================================================
    # DOMINICAN REPUBLIC & INTERNATIONAL
    # =========================================================================
    "Santo Domingo": ("Santo Domingo", "DO", None),
    "Boca Chica": ("Boca Chica", "DO", None),
    "Jubey, Boca Chica": ("Boca Chica", "DO", None),
    "La Gina": ("Santo Domingo", "DO", None),
    "San Antonio De Guerra": ("Santo Domingo", "DO", None),
    "Mexico City": ("Mexico City", "MX", None),
    # =========================================================================
    # MLB/MiLB CITIES (Comprehensive)
    # =========================================================================
    "Akron": ("Akron", "US", "geoId/3901000"),
    "Albuquerque": ("Albuquerque", "US", "geoId/3502000"),
    "Allentown": ("Allentown", "US", "geoId/4202000"),
    "Altoona": ("Altoona", "US", "geoId/4202696"),
    "Amarillo": ("Amarillo", "US", "geoId/4803000"),
    "Anaheim": ("Anaheim", "US", "geoId/0602000"),
    "Arlington": ("Arlington", "US", "geoId/4804000"),
    "Asheville": ("Asheville", "US", "geoId/3702140"),
    "Austin": ("Austin", "US", "geoId/4805000"),
    "Bakersfield": ("Bakersfield", "US", "geoId/0603526"),
    "Biloxi": ("Biloxi", "US", "geoId/2806220"),
    "Binghamton": ("Binghamton", "US", "geoId/3606607"),
    "Birmingham": ("Birmingham", "US", "geoId/0107000"),
    "Bloomington": ("Bloomington", "US", "geoId/1706613"),
    "Bowie": ("Bowie", "US", "geoId/2408775"),
    "Bowling Green": ("Bowling Green", "US", "geoId/2108902"),
    "Bradenton": ("Bradenton", "US", "geoId/1207950"),
    "Bridgeport": ("Bridgeport", "US", "geoId/0908000"),
    "Bridgewater": ("Bridgewater", "US", "geoId/3407810"),
    "Bronx": ("New York", "US", "geoId/3651000"),
    "Brooklyn": ("New York", "US", "geoId/3651000"),
    "Cedar Rapids": ("Cedar Rapids", "US", "geoId/1912000"),
    "Charleston": ("Charleston", "US", "geoId/4513330"),
    "Chattanooga": ("Chattanooga", "US", "geoId/4714000"),
    "Clearwater": ("Clearwater", "US", "geoId/1212875"),
    "Colorado Springs": ("Colorado Springs", "US", "geoId/0816000"),
    "Columbia": ("Columbia", "US", "geoId/4516000"),
    "Comstock Park": ("Grand Rapids", "US", "geoId/2634000"),
    "Corpus Christi": ("Corpus Christi", "US", "geoId/4817000"),
    "Davenport": ("Davenport", "US", "geoId/1919000"),
    "Dayton": ("Dayton", "US", "geoId/3921000"),
    "Daytona Beach": ("Daytona Beach", "US", "geoId/1216525"),
    "Des Moines": ("Des Moines", "US", "geoId/1921000"),
    "Dunedin": ("Dunedin", "US", "geoId/1218575"),
    "Durham": ("Durham", "US", "geoId/3719000"),
    "Eastlake": ("Cleveland", "US", "geoId/3916000"),
    "El Paso": ("El Paso", "US", "geoId/4824000"),
    "Erie": ("Erie", "US", "geoId/4224000"),
    "Eugene": ("Eugene", "US", "geoId/4123850"),
    "Everett": ("Everett", "US", "geoId/5322640"),
    "Fayetteville": ("Fayetteville", "US", "geoId/0523290"),
    "Fort Myers": ("Fort Myers", "US", "geoId/1224125"),
    "Ft. Myers": ("Fort Myers", "US", "geoId/1224125"),
    "Fort Wayne": ("Fort Wayne", "US", "geoId/1825000"),
    "Frederick": ("Frederick", "US", "geoId/2430325"),
    "Fredericksburg": ("Fredericksburg", "US", "geoId/5129600"),
    "Fresno": ("Fresno", "US", "geoId/0627000"),
    "Frisco": ("Frisco", "US", "geoId/4827684"),
    "Geneva": ("Geneva", "US", "geoId/3629531"),
    "Goodyear": ("Phoenix", "US", "geoId/0455000"),
    "Grand Rapids": ("Grand Rapids", "US", "geoId/2634000"),
    "Greensboro": ("Greensboro", "US", "geoId/3728000"),
    "Greenville": ("Greenville", "US", "geoId/4530850"),
    "Gwinnett": ("Lawrenceville", "US", "geoId/1345488"),
    "Harrisburg": ("Harrisburg", "US", "geoId/4232800"),
    "Hartford": ("Hartford", "US", "geoId/0937000"),
    "Henderson": ("Henderson", "US", "geoId/3231900"),
    "Hershey": ("Hershey", "US", "geoId/4234408"),
    "Hickory": ("Hickory", "US", "geoId/3731060"),
    "Hillsboro": ("Hillsboro", "US", "geoId/4134100"),
    "Huntsville": ("Huntsville", "US", "geoId/0137000"),
    "Iowa": ("Des Moines", "US", "geoId/1921000"),
    "Jersey City": ("Jersey City", "US", "geoId/3436000"),
    "Jupiter": ("West Palm Beach", "US", "geoId/1276600"),
    "Kalamazoo": ("Kalamazoo", "US", "geoId/2642160"),
    "Kannapolis": ("Kannapolis", "US", "geoId/3735200"),
    "Kinston": ("Kinston", "US", "geoId/3736020"),
    "Knoxville": ("Knoxville", "US", "geoId/4740000"),
    "Lake Elsinore": ("Lake Elsinore", "US", "geoId/0640354"),
    "Lakeland": ("Lakeland", "US", "geoId/1239075"),
    "Lakewood": ("Lakewood", "US", "geoId/0839855"),
    "Lansing": ("Lansing", "US", "geoId/2646000"),
    "Lawrenceville": ("Lawrenceville", "US", "geoId/1345488"),
    "Lehigh Valley": ("Allentown", "US", "geoId/4202000"),
    "Long Island": ("Hempstead", "US", "geoId/3632402"),
    "Louisville": ("Louisville", "US", "geoId/2148006"),
    "Lynchburg": ("Lynchburg", "US", "geoId/5147672"),
    "Madison": ("Madison", "US", "geoId/5548000"),
    "Memphis": ("Memphis", "US", "geoId/4748000"),
    "Mesa": ("Mesa", "US", "geoId/0446000"),
    "Midland": ("Midland", "US", "geoId/4848072"),
    "Modesto": ("Modesto", "US", "geoId/0648354"),
    "Montgomery": ("Montgomery", "US", "geoId/0151000"),
    "Moosic": ("Scranton", "US", "geoId/4269000"),
    "Myrtle Beach": ("Myrtle Beach", "US", "geoId/4549075"),
    "Noblesville": ("Indianapolis", "US", "geoId/1836003"),
    "Norfolk": ("Norfolk", "US", "geoId/5157000"),
    "North Augusta": ("Augusta", "US", "geoId/1304204"),
    "North Little Rock": ("Little Rock", "US", "geoId/0541000"),
    "North Port": ("North Port", "US", "geoId/1249675"),
    "Omaha": ("Omaha", "US", "geoId/3137000"),
    "Osceola": ("Kissimmee", "US", "geoId/1236950"),
    "Palm Beach": ("West Palm Beach", "US", "geoId/1276600"),
    "Papillion": ("Omaha", "US", "geoId/3137000"),
    "Pasco": ("Pasco", "US", "geoId/5352370"),
    "Pearl": ("Jackson", "US", "geoId/2836000"),
    "Pensacola": ("Pensacola", "US", "geoId/1255925"),
    "Peoria": ("Peoria", "US", "geoId/0457380"),  # Arizona Peoria
    "Port Charlotte": ("Port Charlotte", "US", "geoId/1258462"),
    "Port St. Lucie": ("Port St. Lucie", "US", "geoId/1258715"),
    "Providence": ("Providence", "US", "geoId/4459000"),
    "Queens": ("New York", "US", "geoId/3651000"),
    "Rancho Cucamonga": ("Rancho Cucamonga", "US", "geoId/0659451"),
    "Rapid City": ("Rapid City", "US", "geoId/4652980"),
    "Reading": ("Reading", "US", "geoId/4263624"),
    "Reno": ("Reno", "US", "geoId/3260600"),
    "Richmond": ("Richmond", "US", "geoId/5167000"),
    "Rochester": ("Rochester", "US", "geoId/3663000"),
    "Rockford": ("Rockford", "US", "geoId/1765000"),
    "Rome": ("Rome", "US", "geoId/1366668"),
    "Round Rock": ("Round Rock", "US", "geoId/4863500"),
    "Salem": ("Salem", "US", "geoId/5164900"),
    "Salisbury": ("Salisbury", "US", "geoId/3759280"),
    "San Bernardino": ("San Bernardino", "US", "geoId/0665000"),
    "Santa Cruz": ("Santa Cruz", "US", "geoId/0669112"),
    "Sarasota": ("Sarasota", "US", "geoId/1264175"),
    "Scottsdale": ("Scottsdale", "US", "geoId/0465000"),
    "Scranton": ("Scranton", "US", "geoId/4269000"),
    "Sioux Falls": ("Sioux Falls", "US", "geoId/4659020"),
    "South Bend": ("South Bend", "US", "geoId/1871000"),
    "South Carolina": ("Charleston", "US", "geoId/4513330"),
    "South Jordan": ("Salt Lake City", "US", "geoId/4967000"),
    "Spartanburg": ("Spartanburg", "US", "geoId/4568290"),
    "Spokane": ("Spokane", "US", "geoId/5367000"),
    "Springfield": ("Springfield", "US", "geoId/2567000"),
    "Springdale": ("Springdale", "US", "geoId/0566080"),
    "St. Lucie": ("Port St. Lucie", "US", "geoId/1258715"),
    "St. Paul": ("St. Paul", "US", "geoId/2758000"),
    "St. Petersburg": ("St. Petersburg", "US", "geoId/1263000"),
    "Stockton": ("Stockton", "US", "geoId/0675000"),
    "Sugar Land": ("Sugar Land", "US", "geoId/4870808"),
    "Surprise": ("Phoenix", "US", "geoId/0455000"),
    "Syracuse": ("Syracuse", "US", "geoId/3673000"),
    "Tacoma": ("Tacoma", "US", "geoId/5370000"),
    "Tempe": ("Tempe", "US", "geoId/0473000"),
    "Toledo": ("Toledo", "US", "geoId/3977000"),
    "Tucson": ("Tucson", "US", "geoId/0477000"),
    "Tulsa": ("Tulsa", "US", "geoId/4075000"),
    "Utica": ("Utica", "US", "geoId/3676540"),
    "Visalia": ("Visalia", "US", "geoId/0682954"),
    "Wappingers Falls": ("Poughkeepsie", "US", "geoId/3659641"),
    "West Palm Beach": ("West Palm Beach", "US", "geoId/1276600"),
    "Wheeling": ("Wheeling", "US", "geoId/5486452"),
    "Wichita": ("Wichita", "US", "geoId/2079000"),
    "Wilkes-Barre/Scranton": ("Scranton", "US", "geoId/4269000"),
    "Wilmington": ("Wilmington", "US", "geoId/1077580"),
    "Wilson": ("Wilson", "US", "geoId/3774540"),
    "Winston-Salem": ("Winston-Salem", "US", "geoId/3775000"),
    "Worcester": ("Worcester", "US", "geoId/2582000"),
    # =========================================================================
    # G-LEAGUE / NBA-SPECIFIC
    # =========================================================================
    "Capital City": ("Washington", "US", "geoId/1150000"),
    "College Park": ("Atlanta", "US", "geoId/1304000"),
    "Delaware": ("Wilmington", "US", "geoId/1077580"),
    "Golden State": ("San Francisco", "US", "geoId/0667000"),
    "Indy": ("Indianapolis", "US", "geoId/1836003"),
    "Maine": ("Portland", "US", "geoId/2360545"),  # Portland, ME
    "Motor City": ("Detroit", "US", "geoId/2622000"),
    "Raptors": ("Toronto", "CA", None),
    "Rio Grande Valley": ("McAllen", "US", "geoId/4845384"),
    "Rip City": ("Portland", "US", "geoId/4159000"),
    "South Bay": ("Los Angeles", "US", "geoId/0644000"),
    "Valley": ("Phoenix", "US", "geoId/0455000"),
    "Vegas": ("Las Vegas", "US", "geoId/3240000"),
    "Westchester": ("White Plains", "US", "geoId/3681677"),
    "Windy": ("Chicago", "US", "geoId/1714000"),
    # =========================================================================
    # AHL / ECHL SPECIFIC
    # =========================================================================
    "Adirondack": ("Glens Falls", "US", "geoId/3629113"),
    "Allen": ("Allen", "US", "geoId/4801924"),
    "Appleton": ("Appleton", "US", "geoId/5502375"),
    "Beloit": ("Beloit", "US", "geoId/5506500"),
    "Coachella Valley": ("Palm Desert", "US", "geoId/0654092"),
    "Idaho": ("Boise", "US", "geoId/1608830"),
    "Manchester": ("Manchester", "US", "geoId/3345140"),
    "Ontario": ("Ontario", "US", "geoId/0653896"),  # Ontario, CA (not Canada)
    "Savannah Ghost": ("Savannah", "US", "geoId/1369000"),
    "Savannah": ("Savannah", "US", "geoId/1369000"),
    "Tahoe": ("South Lake Tahoe", "US", "geoId/0673164"),
    # =========================================================================
    # ALIASES / VARIATIONS
    # =========================================================================
    "D.C.": ("Washington", "US", "geoId/1150000"),
    "DC": ("Washington", "US", "geoId/1150000"),
    "Washington DC": ("Washington", "US", "geoId/1150000"),
    "LA": ("Los Angeles", "US", "geoId/0644000"),
    "NYC": ("New York", "US", "geoId/3651000"),
    "NOLA": ("New Orleans", "US", "geoId/2255000"),
    "Philly": ("Philadelphia", "US", "geoId/4260000"),
    "The Bay": ("San Francisco", "US", "geoId/0667000"),
    "Bay Area": ("San Francisco", "US", "geoId/0667000"),
    "San Francisco Bay Area": ("San Francisco", "US", "geoId/0667000"),
    "Twin Cities": ("Minneapolis", "US", "geoId/2743000"),
    "Foxborough": ("Boston", "US", "geoId/2507000"),
    "Foxboro": ("Boston", "US", "geoId/2507000"),
    "East Rutherford": ("New York", "US", "geoId/3651000"),
    "Glendale": ("Phoenix", "US", "geoId/0455000"),
    "Inglewood": ("Los Angeles", "US", "geoId/0644000"),
    "Landover": ("Washington", "US", "geoId/1150000"),
    "Orchard Park": ("Buffalo", "US", "geoId/3611000"),
    "Santa Clara": ("San Francisco", "US", "geoId/0667000"),
    "Hoffman Estates": ("Chicago", "US", "geoId/1714000"),
    "Oshkosh": ("Oshkosh", "US", "geoId/5560500"),
    "White Plains": ("White Plains", "US", "geoId/3681677"),
    "El Segundo": ("Los Angeles", "US", "geoId/0644000"),
    "Kissimmee": ("Kissimmee", "US", "geoId/1236950"),
    "Edinburg": ("McAllen", "US", "geoId/4845384"),
    "Mississauga": ("Toronto", "CA", None),
    # =========================================================================
    # NYC NEIGHBORHOODS / BOROUGHS
    # =========================================================================
    "Flushing": ("New York", "US", "geoId/3651000"),  # Queens neighborhood
    # =========================================================================
    # PLACEHOLDER / INVALID REGIONS (flagged as unmapped)
    # =========================================================================
    "Team": (None, None, None),
    "Stats": (None, None, None),
    "Future": (None, None, None),
    "NHL/AHL": (None, None, None),
}


@EnricherRegistry.register
class GeoEnricher(BaseEnricher):
    """
    Enricher that adds geographic data to team records.

    Uses the Data Commons API to fetch city population data.

    Fields added:
    - geo_city: Resolved city name
    - geo_country: Country code (US, CA, MX, DO)
    - city_population: Population count for the team's city (US only)
    - metro_gdp: Metro area GDP in raw dollars (future enhancement)
    """

    name = "Geographic Enricher"
    description = (
        "Adds city population and metro GDP data from Data Commons and BEA APIs"
    )
    fields_added = ["geo_city", "geo_country", "city_population", "metro_gdp"]

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

        # Track unmapped regions for reporting
        self._unmapped_regions: Dict[str, int] = {}
        self._non_us_regions: Dict[str, int] = {}

    def is_available(self) -> bool:
        """Check if the enricher can run (has API key)."""
        # Data Commons API works without an API key (with rate limits)
        return True

    async def _pre_enrich(self, teams: List[TeamRow]) -> None:
        """Initialize HTTP client before processing."""
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.config.request_timeout_s)
        )
        # Reset tracking
        self._unmapped_regions = {}
        self._non_us_regions = {}

    async def _post_enrich(self, teams: List[TeamRow]) -> None:
        """Close HTTP client after processing."""
        if self._client:
            await self._client.aclose()
            self._client = None

        # Log summary of unmapped regions
        if self._unmapped_regions:
            print(f"\n⚠️  Unmapped regions ({len(self._unmapped_regions)}):")
            for region, count in sorted(
                self._unmapped_regions.items(), key=lambda x: -x[1]
            ):
                print(f'   - "{region}" ({count} teams)')

        if self._non_us_regions:
            print(f"\n📍 Non-US regions ({len(self._non_us_regions)}):")
            for region, count in sorted(
                self._non_us_regions.items(), key=lambda x: -x[1]
            ):
                print(f'   - "{region}" ({count} teams)')

    def _resolve_region(
        self, region: str
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Resolve a region string to (city_name, country_code, geo_id).

        Returns (None, None, None) if the region cannot be mapped.
        """
        if not region:
            return (None, None, None)

        cleaned = region.strip()

        # Direct lookup
        if cleaned in REGION_MAPPING:
            return REGION_MAPPING[cleaned]

        # Try case-insensitive lookup
        cleaned_lower = cleaned.lower()
        for key, value in REGION_MAPPING.items():
            if key.lower() == cleaned_lower:
                return value

        # Try title case
        title_case = cleaned.title()
        if title_case in REGION_MAPPING:
            return REGION_MAPPING[title_case]

        return (None, None, None)

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

            if "value" in data:
                population = int(data["value"])
                self._population_cache[geo_id] = population
                return population

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

        # Resolve region to city/country/geo_id
        city, country, geo_id = self._resolve_region(team.region)

        if city is None:
            # Track unmapped region
            self._unmapped_regions[team.region] = (
                self._unmapped_regions.get(team.region, 0) + 1
            )
            return False

        # Set geo_city and geo_country
        if team.geo_city is None:
            team.geo_city = city
            enriched = True

        if team.geo_country is None:
            team.geo_country = country
            enriched = True

        # Fetch population for US cities
        if geo_id and country == "US":
            if team.city_population is None:
                population = await self._fetch_population(geo_id)
                if population is not None:
                    team.city_population = population
                    enriched = True
        elif country and country != "US":
            # Track non-US regions
            self._non_us_regions[f"{city}, {country}"] = (
                self._non_us_regions.get(f"{city}, {country}", 0) + 1
            )

        return enriched

    async def enrich(self, teams: List[TeamRow], progress_callback=None) -> EnrichmentResult:
        """
        Override enrich to add detailed reporting in the result.
        """
        result = await super().enrich(teams, progress_callback=progress_callback)

        # Add details about unmapped and non-US regions
        if result.success:
            result.details = {
                "unmapped_regions": dict(self._unmapped_regions),
                "non_us_regions": dict(self._non_us_regions),
                "us_teams_enriched": result.teams_enriched,
            }

        return result

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
