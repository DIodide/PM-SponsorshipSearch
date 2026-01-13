"""
Sponsor Enricher for team data.

Adds stadium and sponsor information using:
- WikiData SPARQL for stadium ownership and names (batch queries per league)
- Team website scraping for partner/sponsor pages
- Gemini API for extracting and categorizing sponsors
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from .base import BaseEnricher, EnricherConfig, EnricherRegistry
from ..models import TeamRow, EnrichmentResult


# =============================================================================
# API CONFIGURATION
# =============================================================================

# WikiData SPARQL endpoint - use format=json in URL params
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"

# WikiData requires a descriptive User-Agent with contact info
# See: https://meta.wikimedia.org/wiki/User-Agent_policy
WIKIDATA_USER_AGENT = "PlayMaker-SponsorshipSearch/1.0 (https://github.com/playmaker; contact@playmaker.com) Python/httpx"

# Gemini API configuration (same as main.py)
GEMINI_API_KEY_VAR = "GOOGLE_GENERATIVE_AI_API_KEY"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


# =============================================================================
# LEAGUE CONFIGURATION FOR WIKIDATA QUERIES
# =============================================================================
# Correct WikiData entity IDs discovered via SPARQL exploration:
# - League ID (P118 = league)
# - Team class ID (P31 = instance of)
# =============================================================================

LEAGUE_CONFIG = {
    "NFL": {
        "league_id": "Q1215884",  # National Football League
        "team_class": "Q17156793",  # American football team
    },
    "NBA": {
        "league_id": "Q155223",  # National Basketball Association
        "team_class": "Q13393265",  # basketball team
    },
    "MLB": {
        "league_id": "Q1163715",  # Major League Baseball
        "team_class": "Q13027888",  # baseball team
    },
    "NHL": {
        "league_id": "Q1215892",  # National Hockey League
        "team_class": "Q4498974",  # ice hockey team
    },
    # G League
    "G League": {
        "league_id": "Q1191735",  # NBA G League
        "team_class": "Q13393265",  # basketball team
    },
    # Minor leagues - use same class as parent
    "Triple-A East": {
        "league_id": "Q1163715",
        "team_class": "Q13027888",
    },
    "Triple-A West": {
        "league_id": "Q1163715",
        "team_class": "Q13027888",
    },
    "AHL": {
        "league_id": "Q319076",  # American Hockey League
        "team_class": "Q4498974",
    },
    "ECHL": {
        "league_id": "Q1128192",  # ECHL
        "team_class": "Q4498974",
    },
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


@EnricherRegistry.register
class SponsorEnricher(BaseEnricher):
    """
    Enricher that adds stadium and sponsor data to team records.

    Uses:
    - WikiData SPARQL for stadium ownership and names (batch queries per league)
    - Team website scraping for partner/sponsor pages
    - Gemini API for extracting and categorizing sponsors

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

        # Pre-fetched stadium data cache: normalized_team_name -> {stadium_name, owns_stadium}
        self._stadium_cache: Dict[str, Dict[str, Any]] = {}

        # Track statistics
        self._stats = {
            "wikidata_batch_queries": 0,
            "wikidata_teams_found": 0,
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
        # WikiData client with proper User-Agent (required by Wikimedia)
        self._wikidata_client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0),  # Longer timeout for batch queries
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

        # Reset stats
        self._stats = {
            "wikidata_batch_queries": 0,
            "wikidata_teams_found": 0,
            "stadium_cache_hits": 0,
            "stadium_cache_misses": 0,
            "sponsor_pages_found": 0,
            "sponsor_pages_not_found": 0,
            "gemini_extractions": 0,
            "gemini_errors": 0,
        }

        # Pre-fetch stadium data for all leagues
        await self._prefetch_stadium_data(teams)

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
        print(f"   WikiData batch queries: {self._stats['wikidata_batch_queries']}")
        print(f"   WikiData teams found: {self._stats['wikidata_teams_found']}")
        print(f"   Stadium cache hits: {self._stats['stadium_cache_hits']}")
        print(f"   Stadium cache misses: {self._stats['stadium_cache_misses']}")
        print(f"   Sponsor pages found: {self._stats['sponsor_pages_found']}")
        print(f"   Sponsor pages not found: {self._stats['sponsor_pages_not_found']}")
        print(f"   Gemini extractions: {self._stats['gemini_extractions']}")
        print(f"   Gemini errors: {self._stats['gemini_errors']}")

    async def _prefetch_stadium_data(self, teams: List[TeamRow]) -> None:
        """
        Pre-fetch stadium data from WikiData for all leagues in the team list.

        Uses batch SPARQL queries per league to efficiently get all stadium data.
        """
        # Determine which leagues we need to query
        leagues_needed = set()
        for team in teams:
            league = team.league
            if league in LEAGUE_CONFIG:
                leagues_needed.add(league)
            else:
                # Try to map to a known league
                for known_league in LEAGUE_CONFIG.keys():
                    if known_league.lower() in league.lower():
                        leagues_needed.add(known_league)
                        break

        print(f"🔍 Pre-fetching stadium data for leagues: {leagues_needed}")

        # Query each league
        for league in leagues_needed:
            await self._fetch_league_stadiums(league)
            # Small delay between queries to be respectful
            await asyncio.sleep(0.5)

    async def _fetch_league_stadiums(self, league: str) -> None:
        """
        Fetch stadium data for all teams in a league via WikiData SPARQL.
        """
        if not self._wikidata_client:
            return

        config = LEAGUE_CONFIG.get(league)
        if not config:
            return

        league_id = config["league_id"]
        team_class = config["team_class"]

        # SPARQL query to get all teams with their stadiums
        # Using format=json in URL is more reliable than Accept header
        sparql_query = f"""
SELECT DISTINCT ?team ?teamLabel ?venue ?venueLabel ?venueOwnerLabel WHERE {{
  ?team wdt:P118 wd:{league_id} .
  ?team wdt:P31 wd:{team_class} .
  FILTER NOT EXISTS {{ ?team wdt:P576 ?dissolved . }}
  OPTIONAL {{ ?team wdt:P115 ?venue . }}
  OPTIONAL {{ ?venue wdt:P127 ?venueOwner . }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
"""

        try:
            response = await self._wikidata_client.get(
                WIKIDATA_SPARQL_URL,
                params={"query": sparql_query, "format": "json"},
            )

            if response.status_code == 429:
                # Rate limited - wait and retry
                retry_after = int(response.headers.get("Retry-After", 10))
                print(f"⏳ WikiData rate limited, waiting {retry_after}s...")
                await asyncio.sleep(retry_after)
                response = await self._wikidata_client.get(
                    WIKIDATA_SPARQL_URL,
                    params={"query": sparql_query, "format": "json"},
                )

            response.raise_for_status()
            data = response.json()

            self._stats["wikidata_batch_queries"] += 1

            bindings = data.get("results", {}).get("bindings", [])
            print(f"   📥 {league}: Found {len(bindings)} team-venue pairs")

            # Process results into cache
            for binding in bindings:
                team_label = binding.get("teamLabel", {}).get("value", "")
                venue_label = binding.get("venueLabel", {}).get("value")
                venue_owner = binding.get("venueOwnerLabel", {}).get("value")

                if not team_label:
                    continue

                normalized_name = normalize_team_name(team_label)

                # Skip if already cached (keep first result which is usually current)
                if normalized_name in self._stadium_cache:
                    continue

                # Determine ownership
                owns_stadium = None
                if venue_owner:
                    team_name_lower = team_label.lower()
                    owner_lower = venue_owner.lower()
                    # Check if team name appears in owner
                    if team_name_lower in owner_lower:
                        owns_stadium = True
                    else:
                        # Check if significant words from team name appear
                        team_words = [w for w in team_name_lower.split() if len(w) > 3]
                        owns_stadium = any(w in owner_lower for w in team_words)

                self._stadium_cache[normalized_name] = {
                    "stadium_name": venue_label,
                    "owns_stadium": owns_stadium,
                }
                self._stats["wikidata_teams_found"] += 1

        except httpx.HTTPStatusError as e:
            print(f"❌ WikiData error for {league}: HTTP {e.response.status_code}")
        except httpx.TimeoutException:
            print(f"❌ WikiData timeout for {league}")
        except Exception as e:
            print(f"❌ WikiData error for {league}: {e}")

    def _lookup_stadium(self, team_name: str) -> Optional[Dict[str, Any]]:
        """
        Look up stadium data from the pre-fetched cache.

        Tries multiple matching strategies:
        1. Exact normalized match
        2. Contains match (either direction)
        3. Last word (nickname) match
        """
        normalized = normalize_team_name(team_name)

        # Try exact match
        if normalized in self._stadium_cache:
            self._stats["stadium_cache_hits"] += 1
            return self._stadium_cache[normalized]

        # Try contains match
        for cached_name, data in self._stadium_cache.items():
            if normalized in cached_name or cached_name in normalized:
                self._stats["stadium_cache_hits"] += 1
                return data

        # Try nickname match (last word)
        team_parts = normalized.split()
        if team_parts:
            team_nickname = team_parts[-1]
            for cached_name, data in self._stadium_cache.items():
                cached_parts = cached_name.split()
                if cached_parts and cached_parts[-1] == team_nickname:
                    # Make sure it's not a false positive (e.g., "Tigers" matching wrong team)
                    # by checking if at least one other word matches
                    if len(team_parts) > 1 and len(cached_parts) > 1:
                        if any(w in cached_name for w in team_parts[:-1] if len(w) > 2):
                            self._stats["stadium_cache_hits"] += 1
                            return data

        self._stats["stadium_cache_misses"] += 1
        return None

    async def _find_sponsor_page(self, base_url: str) -> Optional[str]:
        """
        Try to find the sponsor/partners page on a team website.
        """
        if not self._web_client or not base_url:
            return None

        # Normalize base URL
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
        """
        Scrape content from a sponsor page.
        """
        if not self._web_client or not url:
            return None

        try:
            response = await self._web_client.get(url, timeout=20.0)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            # Remove non-content elements
            for element in soup(["script", "style", "nav", "footer", "header"]):
                element.decompose()

            # Get text content
            text = soup.get_text(separator="\n", strip=True)

            # Extract image alt texts (often contain sponsor names)
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
        """
        Use Gemini to extract and categorize sponsors from page content.
        """
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

                # Parse JSON from response
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

    async def _enrich_team(self, team: TeamRow) -> bool:
        """
        Enrich a single team with stadium and sponsor data.
        """
        enriched = False

        # Step 1: Get stadium info from pre-fetched cache
        if team.stadium_name is None or team.owns_stadium is None:
            stadium_data = self._lookup_stadium(team.name)

            if stadium_data:
                if team.stadium_name is None and stadium_data.get("stadium_name"):
                    team.stadium_name = stadium_data["stadium_name"]
                    enriched = True

                if (
                    team.owns_stadium is None
                    and stadium_data.get("owns_stadium") is not None
                ):
                    team.owns_stadium = stadium_data["owns_stadium"]
                    enriched = True

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
            else:
                self._stats["sponsor_pages_not_found"] += 1

        return enriched

    async def enrich(self, teams: List[TeamRow]) -> EnrichmentResult:
        """
        Override enrich to add detailed reporting in the result.
        """
        result = await super().enrich(teams)

        if result.success:
            result.details = {
                "wikidata_batch_queries": self._stats["wikidata_batch_queries"],
                "wikidata_teams_found": self._stats["wikidata_teams_found"],
                "stadium_cache_hits": self._stats["stadium_cache_hits"],
                "stadium_cache_misses": self._stats["stadium_cache_misses"],
                "sponsor_pages_found": self._stats["sponsor_pages_found"],
                "sponsor_pages_not_found": self._stats["sponsor_pages_not_found"],
                "gemini_extractions": self._stats["gemini_extractions"],
                "gemini_errors": self._stats["gemini_errors"],
            }

        return result
