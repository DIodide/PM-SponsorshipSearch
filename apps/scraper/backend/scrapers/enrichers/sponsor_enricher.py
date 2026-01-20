"""
Sponsor Enricher for team data.

Adds stadium and sponsor information using:
- WikiData SPARQL for stadium ownership and names (batch queries by sport)
- Team website scraping for partner/sponsor pages
- Gemini API for extracting and categorizing sponsors
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from .base import BaseEnricher, EnricherConfig, EnricherRegistry
from ..models import TeamRow, EnrichmentResult
from ..source_collector import SourceCollector, SourceNames


# =============================================================================
# API CONFIGURATION
# =============================================================================

WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"

# WikiData requires a descriptive User-Agent with contact info
WIKIDATA_USER_AGENT = "PlayMaker-SponsorshipSearch/1.0 (https://github.com/playmaker; contact@playmaker.com) Python/httpx"

# Gemini API configuration
GEMINI_API_KEY_VAR = "GOOGLE_GENERATIVE_AI_API_KEY"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


# =============================================================================
# SPORT-BASED WIKIDATA CONFIGURATION
# =============================================================================
# Instead of league-specific queries, we query by SPORT (team class).
# This catches all teams regardless of specific league membership.
# =============================================================================

SPORT_CONFIG = {
    "baseball": {
        "team_class": "Q13027888",  # baseball team
        "keywords": ["baseball", "mlb", "milb", "league"],
    },
    "basketball": {
        "team_class": "Q13393265",  # basketball team
        "keywords": ["basketball", "nba", "g league", "gleague"],
    },
    "football": {
        "team_class": "Q17156793",  # American football team
        "keywords": ["football", "nfl"],
    },
    "hockey": {
        "team_class": "Q4498974",  # ice hockey team
        "keywords": ["hockey", "nhl", "ahl", "echl"],
    },
}

# Map league strings to sports (for detecting which sport a team belongs to)
LEAGUE_TO_SPORT = {
    # Baseball
    "major league baseball": "baseball",
    "mlb": "baseball",
    "milb": "baseball",
    "minor league baseball": "baseball",
    "triple-a": "baseball",
    "double-a": "baseball",
    "single-a": "baseball",
    "high-a": "baseball",
    "low-a": "baseball",
    "rookie": "baseball",
    "international league": "baseball",
    "pacific coast league": "baseball",
    "eastern league": "baseball",
    "southern league": "baseball",
    "texas league": "baseball",
    "midwest league": "baseball",
    "south atlantic league": "baseball",
    "carolina league": "baseball",
    "florida state league": "baseball",
    "california league": "baseball",
    "northwest league": "baseball",
    "florida complex league": "baseball",
    "arizona complex league": "baseball",
    "dominican summer league": "baseball",
    "american league": "baseball",
    "national league": "baseball",
    # Basketball
    "nba": "basketball",
    "national basketball association": "basketball",
    "g league": "basketball",
    "nba g league": "basketball",
    "gleague": "basketball",
    # Football
    "nfl": "football",
    "national football league": "football",
    # Hockey
    "nhl": "hockey",
    "national hockey league": "hockey",
    "ahl": "hockey",
    "american hockey league": "hockey",
    "echl": "hockey",
}


# =============================================================================
# SPONSOR PAGE URL PATTERNS
# =============================================================================

SPONSOR_PAGE_PATTERNS = [
    "/partners",
    "/sponsors",
    "/corporate-partners",
    "/corporate-sponsorship",
    "/business-partners",
    "/partnership",
    "/partnerships",
    "/corporate",
    "/sponsorship",
    "/sponsor",
]


def normalize_team_name(name: str) -> str:
    """Normalize team name for matching (lowercase, remove extra spaces)."""
    return " ".join(name.lower().split())


def detect_sport_from_league(league_str: str) -> Optional[str]:
    """
    Detect the sport from a league string.

    Handles compound league names like "Major League Baseball — American League"
    or "Triple-A — International League".
    """
    league_lower = league_str.lower()

    # Check for direct matches
    for keyword, sport in LEAGUE_TO_SPORT.items():
        if keyword in league_lower:
            return sport

    # Check sport config keywords
    for sport, config in SPORT_CONFIG.items():
        for keyword in config["keywords"]:
            if keyword in league_lower:
                return sport

    return None


@EnricherRegistry.register
class SponsorEnricher(BaseEnricher):
    """
    Enricher that adds stadium and sponsor data to team records.

    Uses a robust multi-strategy approach:
    1. Pre-fetch all teams by SPORT (not league) from WikiData
    2. Match teams by normalized name
    3. Fall back to direct team search if needed

    Fields added:
    - owns_stadium: Whether the team owns their stadium
    - stadium_name: Name of the team's home stadium/arena
    - sponsors: List of sponsor partnerships with categories
    """

    name = "Sponsor Enricher"
    description = "Adds stadium ownership, stadium names, and sponsor information from WikiData and team websites"
    fields_added = ["owns_stadium", "stadium_name", "sponsors"]

    def __init__(self, config: Optional[EnricherConfig] = None):
        """Initialize with optional configuration."""
        super().__init__(config)

        # Gemini API key from config or environment
        self.gemini_api_key = self.config.api_keys.get("gemini") or os.environ.get(
            GEMINI_API_KEY_VAR, ""
        )

        # HTTP clients (initialized in _pre_enrich)
        self._wikidata_client: Optional[httpx.AsyncClient] = None
        self._web_client: Optional[httpx.AsyncClient] = None

        # Stadium data cache: normalized_team_name -> {stadium_name, owns_stadium}
        self._stadium_cache: Dict[str, Dict[str, Any]] = {}

        # Track which sports have been fetched
        self._fetched_sports: Set[str] = set()

        # Track statistics
        self._stats = {
            "wikidata_sport_queries": 0,
            "wikidata_teams_found": 0,
            "wikidata_name_searches": 0,
            "stadium_cache_hits": 0,
            "stadium_cache_misses": 0,
            "sponsor_pages_found": 0,
            "sponsor_pages_not_found": 0,
            "gemini_extractions": 0,
            "gemini_errors": 0,
        }

    def is_available(self) -> bool:
        """Check if the enricher can run."""
        return True

    async def _pre_enrich(self, teams: List[TeamRow]) -> None:
        """Initialize HTTP clients and pre-fetch stadium data."""
        # WikiData client with proper User-Agent
        self._wikidata_client = httpx.AsyncClient(
            timeout=httpx.Timeout(90.0),  # Long timeout for batch queries
            headers={"User-Agent": WIKIDATA_USER_AGENT},
        )

        # Web scraping client for team websites
        self._web_client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.config.request_timeout_s),
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            },
        )

        # Reset state
        self._stadium_cache = {}
        self._fetched_sports = set()
        self._stats = {
            "wikidata_sport_queries": 0,
            "wikidata_teams_found": 0,
            "wikidata_name_searches": 0,
            "stadium_cache_hits": 0,
            "stadium_cache_misses": 0,
            "sponsor_pages_found": 0,
            "sponsor_pages_not_found": 0,
            "gemini_extractions": 0,
            "gemini_errors": 0,
        }

        # Detect which sports we need to query
        sports_needed = set()
        for team in teams:
            sport = detect_sport_from_league(team.league)
            if sport:
                sports_needed.add(sport)

        print(f"🔍 Detected sports from teams: {sports_needed}")

        # Pre-fetch stadium data for each sport
        for sport in sports_needed:
            await self._fetch_sport_stadiums(sport)
            await asyncio.sleep(1.0)  # Respectful delay between large queries

    async def _post_enrich(self, teams: List[TeamRow]) -> None:
        """Close HTTP clients and log stats."""
        if self._wikidata_client:
            await self._wikidata_client.aclose()
            self._wikidata_client = None
        if self._web_client:
            await self._web_client.aclose()
            self._web_client = None

        # Log summary
        print("\n📊 Sponsor Enricher Summary:")
        print(f"   WikiData sport queries: {self._stats['wikidata_sport_queries']}")
        print(f"   WikiData teams found: {self._stats['wikidata_teams_found']}")
        print(f"   WikiData name searches: {self._stats['wikidata_name_searches']}")
        print(f"   Stadium cache size: {len(self._stadium_cache)}")
        print(f"   Stadium cache hits: {self._stats['stadium_cache_hits']}")
        print(f"   Stadium cache misses: {self._stats['stadium_cache_misses']}")
        print(f"   Sponsor pages found: {self._stats['sponsor_pages_found']}")
        print(f"   Sponsor pages not found: {self._stats['sponsor_pages_not_found']}")
        print(f"   Gemini extractions: {self._stats['gemini_extractions']}")
        print(f"   Gemini errors: {self._stats['gemini_errors']}")

    async def _fetch_sport_stadiums(self, sport: str) -> None:
        """
        Fetch stadium data for ALL teams of a given sport from WikiData.

        This is more comprehensive than querying by specific league.
        """
        if not self._wikidata_client:
            return

        if sport in self._fetched_sports:
            return

        config = SPORT_CONFIG.get(sport)
        if not config:
            return

        team_class = config["team_class"]

        print(f"   📥 Fetching all {sport} teams from WikiData...")

        # Query ALL teams of this sport type with venues
        # Using OPTIONAL for venue so we still get teams without venues
        sparql_query = f"""
SELECT DISTINCT ?team ?teamLabel ?venue ?venueLabel ?venueOwnerLabel WHERE {{
  ?team wdt:P31 wd:{team_class} .
  FILTER NOT EXISTS {{ ?team wdt:P576 ?dissolved . }}
  OPTIONAL {{ 
    ?team wdt:P115 ?venue .
    OPTIONAL {{ ?venue wdt:P127 ?venueOwner . }}
  }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
"""

        try:
            response = await self._wikidata_client.get(
                WIKIDATA_SPARQL_URL,
                params={"query": sparql_query, "format": "json"},
            )

            # Handle rate limiting
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 30))
                print(f"   ⏳ WikiData rate limited, waiting {retry_after}s...")
                await asyncio.sleep(retry_after)
                response = await self._wikidata_client.get(
                    WIKIDATA_SPARQL_URL,
                    params={"query": sparql_query, "format": "json"},
                )

            response.raise_for_status()
            data = response.json()

            self._stats["wikidata_sport_queries"] += 1
            self._fetched_sports.add(sport)

            bindings = data.get("results", {}).get("bindings", [])
            print(f"   ✅ {sport}: Found {len(bindings)} team records")

            # Process results into cache
            teams_with_venues = 0
            for binding in bindings:
                team_label = binding.get("teamLabel", {}).get("value", "")
                venue_label = binding.get("venueLabel", {}).get("value")
                venue_owner = binding.get("venueOwnerLabel", {}).get("value")

                if not team_label:
                    continue

                normalized_name = normalize_team_name(team_label)

                # Skip if already cached
                if normalized_name in self._stadium_cache:
                    continue

                # Only count if we have venue info
                if venue_label:
                    teams_with_venues += 1

                # Determine ownership
                owns_stadium = None
                if venue_owner and venue_label:
                    team_name_lower = team_label.lower()
                    owner_lower = venue_owner.lower()
                    if team_name_lower in owner_lower:
                        owns_stadium = True
                    else:
                        team_words = [w for w in team_name_lower.split() if len(w) > 3]
                        owns_stadium = any(w in owner_lower for w in team_words)

                self._stadium_cache[normalized_name] = {
                    "stadium_name": venue_label,
                    "owns_stadium": owns_stadium,
                }
                self._stats["wikidata_teams_found"] += 1

            print(f"   📍 {sport}: {teams_with_venues} teams have venue data")

        except httpx.HTTPStatusError as e:
            print(f"   ❌ WikiData error for {sport}: HTTP {e.response.status_code}")
            if e.response.status_code == 500:
                print(f"      Response: {e.response.text[:500]}")
        except httpx.TimeoutException:
            print(f"   ❌ WikiData timeout for {sport}")
        except Exception as e:
            print(f"   ❌ WikiData error for {sport}: {e}")

    async def _search_team_by_name(self, team_name: str) -> Optional[Dict[str, Any]]:
        """
        Search WikiData for a specific team by name.

        Fallback for teams not found in bulk queries.
        """
        if not self._wikidata_client:
            return None

        self._stats["wikidata_name_searches"] += 1

        # Escape special characters for SPARQL
        escaped_name = team_name.replace('"', '\\"')

        sparql_query = f"""
SELECT ?team ?teamLabel ?venue ?venueLabel ?venueOwnerLabel WHERE {{
  ?team rdfs:label "{escaped_name}"@en .
  OPTIONAL {{ 
    ?team wdt:P115 ?venue .
    OPTIONAL {{ ?venue wdt:P127 ?venueOwner . }}
  }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}} LIMIT 1
"""

        try:
            response = await self._wikidata_client.get(
                WIKIDATA_SPARQL_URL,
                params={"query": sparql_query, "format": "json"},
            )
            response.raise_for_status()
            data = response.json()

            bindings = data.get("results", {}).get("bindings", [])
            if not bindings:
                return None

            binding = bindings[0]
            venue_label = binding.get("venueLabel", {}).get("value")
            venue_owner = binding.get("venueOwnerLabel", {}).get("value")

            if not venue_label:
                return None

            # Determine ownership
            owns_stadium = None
            if venue_owner:
                team_name_lower = team_name.lower()
                owner_lower = venue_owner.lower()
                if team_name_lower in owner_lower:
                    owns_stadium = True
                else:
                    team_words = [w for w in team_name_lower.split() if len(w) > 3]
                    owns_stadium = any(w in owner_lower for w in team_words)

            result = {
                "stadium_name": venue_label,
                "owns_stadium": owns_stadium,
            }

            # Cache for future lookups
            normalized = normalize_team_name(team_name)
            self._stadium_cache[normalized] = result

            return result

        except Exception as e:
            print(f"   ⚠️ Name search failed for {team_name}: {e}")
            return None

    def _lookup_stadium(self, team_name: str) -> Optional[Dict[str, Any]]:
        """
        Look up stadium data from the pre-fetched cache.

        Tries multiple matching strategies:
        1. Exact normalized match
        2. Contains match (team name in cached name)
        3. Reverse contains (cached name in team name)
        4. Nickname match with validation
        """
        normalized = normalize_team_name(team_name)

        # Strategy 1: Exact match
        if normalized in self._stadium_cache:
            self._stats["stadium_cache_hits"] += 1
            return self._stadium_cache[normalized]

        # Strategy 2: Team name contains cached name
        for cached_name, data in self._stadium_cache.items():
            if cached_name in normalized:
                self._stats["stadium_cache_hits"] += 1
                return data

        # Strategy 3: Cached name contains team name
        for cached_name, data in self._stadium_cache.items():
            if normalized in cached_name:
                self._stats["stadium_cache_hits"] += 1
                return data

        # Strategy 4: Nickname match with location validation
        team_parts = normalized.split()
        if len(team_parts) >= 2:
            team_nickname = team_parts[-1]
            team_location = " ".join(team_parts[:-1])

            for cached_name, data in self._stadium_cache.items():
                cached_parts = cached_name.split()
                if len(cached_parts) >= 2:
                    cached_nickname = cached_parts[-1]
                    cached_location = " ".join(cached_parts[:-1])

                    # Nickname must match exactly
                    if team_nickname == cached_nickname:
                        # And at least part of location should match
                        if (
                            team_location in cached_location
                            or cached_location in team_location
                            or any(
                                loc in cached_location
                                for loc in team_location.split()
                                if len(loc) > 2
                            )
                        ):
                            self._stats["stadium_cache_hits"] += 1
                            return data

        self._stats["stadium_cache_misses"] += 1
        return None

    async def _find_sponsor_page(self, base_url: str) -> Optional[str]:
        """Try to find the sponsor/partners page on a team website."""
        if not self._web_client or not base_url:
            return None

        parsed = urlparse(base_url)
        base = f"{parsed.scheme}://{parsed.netloc}"

        for pattern in SPONSOR_PAGE_PATTERNS:
            test_url = urljoin(base, pattern)
            try:
                response = await self._web_client.head(test_url, timeout=10.0)
                if response.status_code == 200:
                    return test_url
            except Exception:
                continue

        # Try to find a link from the homepage
        try:
            response = await self._web_client.get(base_url, timeout=15.0)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            sponsor_keywords = ["sponsor", "partner", "corporate", "business"]
            for link in soup.find_all("a", href=True):
                href = link.get("href", "").lower()
                text = link.get_text().lower()
                if any(kw in href or kw in text for kw in sponsor_keywords):
                    full_url = urljoin(base, link["href"])
                    return full_url
        except Exception:
            pass

        return None

    async def _scrape_sponsor_page(self, url: str) -> Optional[str]:
        """Scrape content from a sponsor page."""
        if not self._web_client or not url:
            return None

        try:
            response = await self._web_client.get(url, timeout=20.0)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            for element in soup(["script", "style", "nav", "footer", "header"]):
                element.decompose()

            text = soup.get_text(separator="\n", strip=True)

            alt_texts = [
                img.get("alt", "") for img in soup.find_all("img") if img.get("alt")
            ]

            full_content = text + "\n\nImage labels: " + ", ".join(alt_texts)
            return full_content[:15000]

        except Exception as e:
            print(f"Error scraping sponsor page {url}: {e}")
            return None

    async def _extract_sponsors_with_gemini(
        self, team_name: str, page_content: str
    ) -> Optional[List[Dict[str, Any]]]:
        """Use Gemini to extract and categorize sponsors from page content."""
        if not self.gemini_api_key or not page_content:
            return None

        prompt = f"""You are analyzing the corporate partners/sponsors page for {team_name}.

Extract all sponsor and partner names from the following content. For each sponsor, identify:
1. The company/brand name
2. Their business category (e.g., "Beverage", "Financial Services", "Apparel", "Automotive", "Technology", "Insurance", "Healthcare", "Food & Beverage", "Retail", "Telecommunications")
3. The type of partnership if mentioned (e.g., "Official Partner", "Founding Partner", "Jersey Sponsor", "Stadium Naming Rights", "Official Supplier", "Presenting Sponsor")

Page content:
{page_content}

Return ONLY a JSON array of sponsor objects, each with keys: "name", "category", "asset_type".
If the asset_type is not determinable, use "Official Partner" as default.
If the category is not determinable, use "Other" as default.
Only include actual sponsors/partners, not general text or navigation elements.

Example format:
[
  {{"name": "Nike", "category": "Apparel", "asset_type": "Official Outfitter"}},
  {{"name": "Coca-Cola", "category": "Beverage", "asset_type": "Official Partner"}}
]

Return ONLY the JSON array, no explanation or markdown."""

        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 4096,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{GEMINI_API_URL}?key={self.gemini_api_key}",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()

                result = response.json()
                text = result["candidates"][0]["content"]["parts"][0]["text"]

                text = text.strip()
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                    text = text.strip()

                sponsors = json.loads(text)

                if not isinstance(sponsors, list):
                    return None

                validated = []
                for s in sponsors:
                    if isinstance(s, dict) and "name" in s:
                        validated.append(
                            {
                                "name": s.get("name", ""),
                                "category": s.get("category", "Other"),
                                "asset_type": s.get("asset_type", "Official Partner"),
                            }
                        )

                self._stats["gemini_extractions"] += 1
                return validated if validated else None

        except httpx.HTTPStatusError as e:
            print(f"Gemini API error for {team_name}: {e.response.status_code}")
            self._stats["gemini_errors"] += 1
            return None
        except json.JSONDecodeError as e:
            print(f"Failed to parse Gemini response for {team_name}: {e}")
            self._stats["gemini_errors"] += 1
            return None
        except Exception as e:
            print(f"Unexpected error extracting sponsors for {team_name}: {e}")
            self._stats["gemini_errors"] += 1
            return None

    async def _enrich_team(self, team: TeamRow, sources: SourceCollector) -> bool:
        """Enrich a single team with stadium and sponsor data.
        
        Args:
            team: TeamRow to enrich (modified in place)
            sources: SourceCollector to track data sources/citations
        """
        enriched = False

        # Step 1: Get stadium info from cache or search
        if team.stadium_name is None or team.owns_stadium is None:
            # First try cache lookup
            stadium_data = self._lookup_stadium(team.name)

            # If not found, try direct WikiData search
            if not stadium_data:
                stadium_data = await self._search_team_by_name(team.name)

            if stadium_data:
                stadium_fields_added = []
                if team.stadium_name is None and stadium_data.get("stadium_name"):
                    team.stadium_name = stadium_data["stadium_name"]
                    stadium_fields_added.append("stadium_name")
                    enriched = True

                if (
                    team.owns_stadium is None
                    and stadium_data.get("owns_stadium") is not None
                ):
                    team.owns_stadium = stadium_data["owns_stadium"]
                    stadium_fields_added.append("owns_stadium")
                    enriched = True
                
                # Track WikiData as source for stadium data
                if stadium_fields_added:
                    sources.add_database_source(
                        url=WIKIDATA_SPARQL_URL,
                        source_name=SourceNames.WIKIDATA_SPARQL,
                        fields=stadium_fields_added,
                    )

        # Step 2: Get sponsors from team website (if we have Gemini API)
        if team.sponsors is None and self.gemini_api_key and team.official_url:
            sponsor_url = await self._find_sponsor_page(team.official_url)

            if sponsor_url:
                self._stats["sponsor_pages_found"] += 1
                page_content = await self._scrape_sponsor_page(sponsor_url)

                if page_content:
                    sponsors = await self._extract_sponsors_with_gemini(
                        team.name, page_content
                    )

                    if sponsors:
                        team.sponsors = sponsors
                        enriched = True
                        
                        # Track sponsor page as source
                        sources.add_website_source(
                            url=sponsor_url,
                            source_name=SourceNames.TEAM_WEBSITE,
                            fields=["sponsors"],
                        )
            else:
                self._stats["sponsor_pages_not_found"] += 1

        return enriched

    async def enrich(self, teams: List[TeamRow], progress_callback=None) -> EnrichmentResult:
        """Override enrich to add detailed reporting in the result."""
        result = await super().enrich(teams, progress_callback=progress_callback)

        if result.success:
            result.details = {
                "wikidata_sport_queries": self._stats["wikidata_sport_queries"],
                "wikidata_teams_found": self._stats["wikidata_teams_found"],
                "wikidata_name_searches": self._stats["wikidata_name_searches"],
                "stadium_cache_size": len(self._stadium_cache),
                "stadium_cache_hits": self._stats["stadium_cache_hits"],
                "stadium_cache_misses": self._stats["stadium_cache_misses"],
                "sponsor_pages_found": self._stats["sponsor_pages_found"],
                "sponsor_pages_not_found": self._stats["sponsor_pages_not_found"],
                "gemini_extractions": self._stats["gemini_extractions"],
                "gemini_errors": self._stats["gemini_errors"],
            }

        return result
