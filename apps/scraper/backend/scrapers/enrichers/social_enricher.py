"""
Social Media Enricher for team social handles and follower counts.

Uses WikiData SPARQL to discover social media handles, then scrapes
profiles using Playwright for follower/subscriber counts.
Falls back to website scraping for handle discovery when WikiData lacks data.

WikiData Properties:
- P2002: Twitter/X username
- P2003: Instagram username
- P2013: Facebook ID/username
- P7085: TikTok username
- P2397: YouTube channel ID (stable unique ID)

Fields added:
- social_handles: List of {platform, handle, url, unique_id} for each platform
- followers_x: Twitter/X follower count
- followers_instagram: Instagram follower count
- followers_facebook: Facebook follower count
- followers_tiktok: TikTok follower count
- subscribers_youtube: YouTube subscriber count
"""

from __future__ import annotations

import asyncio
import re
import os
from typing import Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse

import httpx

try:
    from playwright.async_api import (
        async_playwright,
        Browser,
        BrowserContext,
        Page,
        TimeoutError as PlaywrightTimeout,
    )

    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

from .base import BaseEnricher, EnricherConfig, EnricherRegistry
from ..models import TeamRow, EnrichmentResult
from ..source_collector import SourceCollector, SourceNames


# =============================================================================
# WIKIDATA CONFIGURATION
# =============================================================================

WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
WIKIDATA_USER_AGENT = "PlayMaker-SponsorshipSearch/1.0 (https://github.com/playmaker; contact@playmaker.com) Python/httpx"

# WikiData properties for social media
WIKIDATA_SOCIAL_PROPERTIES = {
    "x": "P2002",  # Twitter/X username
    "instagram": "P2003",  # Instagram username
    "facebook": "P2013",  # Facebook ID
    "tiktok": "P7085",  # TikTok username
    "youtube": "P2397",  # YouTube channel ID
}

# Sport team classes in WikiData
SPORT_TEAM_CLASSES = {
    "baseball": "Q13027888",  # baseball team
    "basketball": "Q13393265",  # basketball team
    "womens_basketball": "Q1478437",  # women's basketball team
    "football": "Q17156793",  # American football team
    "hockey": "Q4498974",  # ice hockey team
    "soccer": "Q847017",  # association football (soccer) club
    "womens_soccer": "Q15944511",  # women's association football club
}

# League to sport mapping
# NOTE: More specific patterns must come first to avoid substring matching issues
LEAGUE_TO_SPORT = {
    # Basketball (Women's) - must come before men's basketball to match first
    "wnba": "womens_basketball",
    "women's national basketball association": "womens_basketball",
    # Soccer (Women's) - must come before men's soccer to match first
    "nwsl": "womens_soccer",
    "national women's soccer league": "womens_soccer",
    # Basketball (Men's)
    "nba": "basketball",
    "national basketball association": "basketball",
    "g league": "basketball",
    "nba g league": "basketball",
    # Soccer (Men's)
    "mls": "soccer",
    "major league soccer": "soccer",
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
    "class a": "baseball",
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
# SOCIAL MEDIA URL PATTERNS & REGEXES (Fallback)
# =============================================================================

# Patterns to find social media links on team websites
SOCIAL_LINK_PATTERNS = {
    "x": [
        r"(?:https?://)?(?:www\.)?(?:twitter|x)\.com/([a-zA-Z0-9_]+)",
    ],
    "instagram": [
        r"(?:https?://)?(?:www\.)?instagram\.com/([a-zA-Z0-9_.]+)",
    ],
    "facebook": [
        r"(?:https?://)?(?:www\.)?facebook\.com/([a-zA-Z0-9.]+)",
    ],
    "tiktok": [
        r"(?:https?://)?(?:www\.)?tiktok\.com/@([a-zA-Z0-9_.]+)",
    ],
    "youtube": [
        r"(?:https?://)?(?:www\.)?youtube\.com/(?:c/|channel/|user/|@)([a-zA-Z0-9_-]+)",
    ],
}

# Compiled patterns for efficiency
COMPILED_SOCIAL_PATTERNS = {
    platform: [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    for platform, patterns in SOCIAL_LINK_PATTERNS.items()
}

# URLs to visit when scraping
SOCIAL_PROFILE_URLS = {
    "x": "https://x.com/{handle}",
    "instagram": "https://www.instagram.com/{handle}/",
    "facebook": "https://www.facebook.com/{handle}/",
    "tiktok": "https://www.tiktok.com/@{handle}",
    "youtube": "https://www.youtube.com/@{handle}",
    "youtube_channel": "https://www.youtube.com/channel/{handle}",
}

# Selectors for follower counts on each platform
FOLLOWER_SELECTORS = {
    "x": [
        'a[href$="/verified_followers"] span',
        'a[href$="/followers"] span',
        '[data-testid="primaryColumn"] a[href*="/followers"]',
    ],
    "instagram": [
        'meta[property="og:description"]',
        'a[href*="/followers/"] span',
        "header section ul li:nth-child(2) span",
    ],
    "facebook": [
        'a[href*="followers"] span',
        'div[role="main"] a[href*="followers"]',
    ],
    "tiktok": [
        '[data-e2e="followers-count"]',
        'strong[title*="Followers"]',
    ],
    "youtube": [
        "#subscriber-count",
        "yt-formatted-string#subscriber-count",
        "span.yt-core-attributed-string",
    ],
}

# Regex patterns to extract numeric follower counts from text
FOLLOWER_NUMBER_PATTERNS = [
    r"([\d,.]+)\s*([KMBkmb]?)\s*(?:followers?|subscribers?|following)",
    r"(?:followers?|subscribers?)\s*[:\s]*\s*([\d,.]+)\s*([KMBkmb]?)",
    r"([\d,.]+)\s*([KMBkmb])\b",
    r"([\d,]+)\s*(?:followers?|subscribers?)",
]


def normalize_team_name(name: str) -> str:
    """Normalize team name for matching."""
    return " ".join(name.lower().split())


def detect_sport_from_league(league_str: str) -> Optional[str]:
    """Detect the sport from a league string."""
    league_lower = league_str.lower()
    for keyword, sport in LEAGUE_TO_SPORT.items():
        if keyword in league_lower:
            return sport
    return None


def parse_follower_count(text: str) -> Optional[int]:
    """
    Parse a follower count string into an integer.

    Handles formats like:
    - "1,234,567"
    - "1.5M"
    - "15K"
    - "1.5M followers"
    """
    if not text:
        return None

    text = text.strip()

    for pattern in FOLLOWER_NUMBER_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            groups = match.groups()
            num_str = groups[0].replace(",", "")

            try:
                num = float(num_str)
            except ValueError:
                continue

            if len(groups) > 1 and groups[1]:
                multiplier = groups[1].upper()
                if multiplier == "K":
                    num *= 1_000
                elif multiplier == "M":
                    num *= 1_000_000
                elif multiplier == "B":
                    num *= 1_000_000_000

            return int(num)

    try:
        clean = text.replace(",", "").strip()
        match = re.search(r"[\d,.]+", clean)
        if match:
            return int(float(match.group().replace(",", "")))
    except ValueError:
        pass

    return None


@EnricherRegistry.register
class SocialEnricher(BaseEnricher):
    """
    Enricher that collects social media follower counts for teams.

    Uses a multi-strategy approach:
    1. WikiData SPARQL queries for structured social handle data (primary)
    2. Website scraping to find handles (fallback)
    3. Playwright browser scraping for follower counts
    4. Official APIs when keys are available (most reliable)

    Fields added:
    - followers_x: Twitter/X follower count
    - followers_instagram: Instagram follower count
    - followers_facebook: Facebook follower count
    - followers_tiktok: TikTok follower count
    - subscribers_youtube: YouTube subscriber count
    """

    name = "Social Media Enricher"
    description = "Collects social media handles and follower counts from X, Instagram, Facebook, TikTok, and YouTube"
    fields_added = [
        "social_handles",
        "followers_x",
        "followers_instagram",
        "followers_facebook",
        "followers_tiktok",
        "subscribers_youtube",
    ]

    def __init__(self, config: Optional[EnricherConfig] = None):
        """Initialize with optional configuration."""
        super().__init__(config)

        # API keys from config or environment
        self.api_keys = {
            "x": self.config.api_keys.get("x") or os.environ.get("X_API_BEARER_TOKEN"),
            "youtube": self.config.api_keys.get("youtube")
            or os.environ.get("YOUTUBE_API_KEY"),
            "meta": self.config.api_keys.get("meta")
            or os.environ.get("META_ACCESS_TOKEN"),
            "tiktok": self.config.api_keys.get("tiktok")
            or os.environ.get("TIKTOK_API_KEY"),
        }

        # HTTP clients
        self._http_client: Optional[httpx.AsyncClient] = None
        self._wikidata_client: Optional[httpx.AsyncClient] = None

        # Playwright browser (lazy initialized)
        self._playwright = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None

        # WikiData cache: normalized_team_name -> {platform: handle}
        self._wikidata_handles_cache: Dict[str, Dict[str, str]] = {}
        self._fetched_sports: Set[str] = set()

        # Website scraping cache
        self._website_handles_cache: Dict[str, Dict[str, str]] = {}

        # Track statistics
        self._stats = {
            "teams_processed": 0,
            "wikidata_queries": 0,
            "wikidata_teams_found": 0,
            "wikidata_cache_hits": 0,
            "website_scrapes": 0,
            "handles_found": 0,
            "profiles_scraped": 0,
            "profiles_failed": 0,
            "api_calls": 0,
            "api_errors": 0,
            "platform_counts": {},
        }

    def is_available(self) -> bool:
        """Check if the enricher can run."""
        return True

    async def _pre_enrich(self, teams: List[TeamRow]) -> None:
        """Initialize clients and pre-fetch WikiData handles."""
        # HTTP client for website scraping
        self._http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.config.request_timeout_s),
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )

        # WikiData client with proper User-Agent
        self._wikidata_client = httpx.AsyncClient(
            timeout=httpx.Timeout(90.0),
            headers={"User-Agent": WIKIDATA_USER_AGENT},
        )

        # Initialize Playwright for scraping social media profiles
        if PLAYWRIGHT_AVAILABLE:
            try:
                self._playwright = await async_playwright().start()
                self._browser = await self._playwright.chromium.launch(
                    headless=True,
                    args=[
                        "--disable-blink-features=AutomationControlled",
                        "--disable-dev-shm-usage",
                        "--no-sandbox",
                    ],
                )
                self._context = await self._browser.new_context(
                    viewport={"width": 1920, "height": 1080},
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                )
                print("✅ Playwright browser initialized for social scraping")
            except Exception as e:
                print(f"⚠️ Failed to initialize Playwright: {e}")
                self._playwright = None
                self._browser = None
                self._context = None
        else:
            print(
                "⚠️ Playwright not available - install with: pip install playwright && playwright install chromium"
            )

        # Reset stats and caches
        self._stats = {
            "teams_processed": 0,
            "wikidata_queries": 0,
            "wikidata_teams_found": 0,
            "wikidata_cache_hits": 0,
            "website_scrapes": 0,
            "handles_found": 0,
            "profiles_scraped": 0,
            "profiles_failed": 0,
            "api_calls": 0,
            "api_errors": 0,
            "platform_counts": {},
        }
        self._wikidata_handles_cache = {}
        self._website_handles_cache = {}
        self._fetched_sports = set()

        # Pre-fetch WikiData handles for all sports represented in the teams
        sports_needed = set()
        for team in teams:
            sport = detect_sport_from_league(team.league)
            if sport:
                sports_needed.add(sport)

        print(f"🔍 Detected sports from teams: {sports_needed}")

        # Batch fetch social handles from WikiData for each sport
        for sport in sports_needed:
            await self._fetch_wikidata_social_handles_by_sport(sport)
            await asyncio.sleep(1.0)  # Respectful delay

        print(f"📊 WikiData cache size: {len(self._wikidata_handles_cache)} teams")

    async def _post_enrich(self, teams: List[TeamRow]) -> None:
        """Close clients and log summary."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None

        if self._wikidata_client:
            await self._wikidata_client.aclose()
            self._wikidata_client = None

        if self._context:
            await self._context.close()
            self._context = None
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None

        # Log summary
        print("\n📊 Social Media Enricher Summary:")
        print(f"   Teams processed: {self._stats['teams_processed']}")
        print(f"   WikiData queries: {self._stats['wikidata_queries']}")
        print(f"   WikiData teams found: {self._stats['wikidata_teams_found']}")
        print(f"   WikiData cache hits: {self._stats['wikidata_cache_hits']}")
        print(f"   Website scrapes: {self._stats['website_scrapes']}")
        print(f"   Total handles found: {self._stats['handles_found']}")
        print(f"   Profiles scraped: {self._stats['profiles_scraped']}")
        print(f"   Profiles failed: {self._stats['profiles_failed']}")
        print(f"   API calls: {self._stats['api_calls']}")
        print(f"   API errors: {self._stats['api_errors']}")

        if self._stats["platform_counts"]:
            print("   Followers found by platform:")
            for platform, count in sorted(self._stats["platform_counts"].items()):
                print(f"      - {platform}: {count} teams")

    # =========================================================================
    # WIKIDATA METHODS
    # =========================================================================

    async def _fetch_wikidata_social_handles_by_sport(self, sport: str) -> None:
        """
        Fetch social media handles for ALL teams of a given sport from WikiData.
        """
        if not self._wikidata_client:
            return

        if sport in self._fetched_sports:
            return

        team_class = SPORT_TEAM_CLASSES.get(sport)
        if not team_class:
            return

        print(f"   📥 Fetching social handles for {sport} teams from WikiData...")

        # Query all teams of this sport type with social media accounts
        sparql_query = f"""
SELECT DISTINCT ?team ?teamLabel ?twitter ?instagram ?facebook ?tiktok ?youtube WHERE {{
  ?team wdt:P31 wd:{team_class} .
  ?team wdt:P17 wd:Q30 .  # USA-based teams
  FILTER NOT EXISTS {{ ?team wdt:P576 ?dissolved . }}
  
  OPTIONAL {{ ?team wdt:P2002 ?twitter . }}
  OPTIONAL {{ ?team wdt:P2003 ?instagram . }}
  OPTIONAL {{ ?team wdt:P2013 ?facebook . }}
  OPTIONAL {{ ?team wdt:P7085 ?tiktok . }}
  OPTIONAL {{ ?team wdt:P2397 ?youtube . }}
  
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
"""

        try:
            response = await self._wikidata_client.get(
                WIKIDATA_SPARQL_URL,
                params={"query": sparql_query, "format": "json"},
            )

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

            self._stats["wikidata_queries"] += 1
            self._fetched_sports.add(sport)

            bindings = data.get("results", {}).get("bindings", [])
            teams_with_social = 0

            for binding in bindings:
                team_label = binding.get("teamLabel", {}).get("value", "")
                if not team_label:
                    continue

                handles: Dict[str, str] = {}

                twitter = binding.get("twitter", {}).get("value")
                instagram = binding.get("instagram", {}).get("value")
                facebook = binding.get("facebook", {}).get("value")
                tiktok = binding.get("tiktok", {}).get("value")
                youtube = binding.get("youtube", {}).get("value")

                if twitter:
                    handles["x"] = twitter
                if instagram:
                    handles["instagram"] = instagram
                if facebook:
                    handles["facebook"] = facebook
                if tiktok:
                    handles["tiktok"] = tiktok
                if youtube:
                    handles["youtube"] = youtube

                if handles:
                    teams_with_social += 1
                    normalized = normalize_team_name(team_label)
                    self._wikidata_handles_cache[normalized] = handles
                    self._stats["wikidata_teams_found"] += 1

            print(
                f"   ✅ {sport}: Found {len(bindings)} teams, {teams_with_social} with social handles"
            )

        except httpx.HTTPStatusError as e:
            print(f"   ❌ WikiData error for {sport}: HTTP {e.response.status_code}")
        except Exception as e:
            print(f"   ❌ WikiData error for {sport}: {e}")

    async def _search_wikidata_by_name(self, team_name: str) -> Dict[str, str]:
        """
        Search WikiData for a specific team by exact name.

        Fallback for teams not found in batch queries.
        """
        if not self._wikidata_client:
            return {}

        self._stats["wikidata_queries"] += 1

        escaped = team_name.replace('"', '\\"')
        sparql_query = f"""
SELECT ?team ?teamLabel ?twitter ?instagram ?facebook ?tiktok ?youtube WHERE {{
  ?team rdfs:label "{escaped}"@en .
  OPTIONAL {{ ?team wdt:P2002 ?twitter . }}
  OPTIONAL {{ ?team wdt:P2003 ?instagram . }}
  OPTIONAL {{ ?team wdt:P2013 ?facebook . }}
  OPTIONAL {{ ?team wdt:P7085 ?tiktok . }}
  OPTIONAL {{ ?team wdt:P2397 ?youtube . }}
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
                return {}

            binding = bindings[0]
            handles: Dict[str, str] = {}

            twitter = binding.get("twitter", {}).get("value")
            instagram = binding.get("instagram", {}).get("value")
            facebook = binding.get("facebook", {}).get("value")
            tiktok = binding.get("tiktok", {}).get("value")
            youtube = binding.get("youtube", {}).get("value")

            if twitter:
                handles["x"] = twitter
            if instagram:
                handles["instagram"] = instagram
            if facebook:
                handles["facebook"] = facebook
            if tiktok:
                handles["tiktok"] = tiktok
            if youtube:
                handles["youtube"] = youtube

            if handles:
                # Cache the result
                normalized = normalize_team_name(team_name)
                self._wikidata_handles_cache[normalized] = handles
                self._stats["wikidata_teams_found"] += 1

            return handles

        except Exception as e:
            print(f"   ⚠️ WikiData search failed for {team_name}: {e}")
            return {}

    def _lookup_wikidata_handles(self, team_name: str) -> Optional[Dict[str, str]]:
        """
        Look up social handles from the pre-fetched WikiData cache.

        Uses multiple matching strategies:
        1. Exact normalized match
        2. Contains match
        3. Nickname match
        """
        normalized = normalize_team_name(team_name)

        # Strategy 1: Exact match
        if normalized in self._wikidata_handles_cache:
            self._stats["wikidata_cache_hits"] += 1
            return self._wikidata_handles_cache[normalized]

        # Strategy 2: Team name contains cached name
        for cached_name, handles in self._wikidata_handles_cache.items():
            if cached_name in normalized or normalized in cached_name:
                self._stats["wikidata_cache_hits"] += 1
                return handles

        # Strategy 3: Nickname match with location validation
        team_parts = normalized.split()
        if len(team_parts) >= 2:
            team_nickname = team_parts[-1]
            team_location = " ".join(team_parts[:-1])

            for cached_name, handles in self._wikidata_handles_cache.items():
                cached_parts = cached_name.split()
                if len(cached_parts) >= 2:
                    cached_nickname = cached_parts[-1]
                    cached_location = " ".join(cached_parts[:-1])

                    if team_nickname == cached_nickname:
                        if (
                            team_location in cached_location
                            or cached_location in team_location
                            or any(
                                loc in cached_location
                                for loc in team_location.split()
                                if len(loc) > 2
                            )
                        ):
                            self._stats["wikidata_cache_hits"] += 1
                            return handles

        return None

    # =========================================================================
    # WEBSITE SCRAPING METHODS (Fallback)
    # =========================================================================

    async def _find_social_handles_from_website(self, team: TeamRow) -> Dict[str, str]:
        """
        Find social media handles from team website (fallback method).
        """
        if not team.official_url or not self._http_client:
            return {}

        # Check cache first
        if team.name in self._website_handles_cache:
            return self._website_handles_cache[team.name]

        handles: Dict[str, str] = {}
        self._stats["website_scrapes"] += 1

        try:
            response = await self._http_client.get(team.official_url)
            response.raise_for_status()
            html = response.text

            # Also check common social pages
            parsed = urlparse(team.official_url)
            base = f"{parsed.scheme}://{parsed.netloc}"
            social_pages = ["/social", "/connect", "/contact", "/about"]

            all_html = html
            for page in social_pages:
                try:
                    page_response = await self._http_client.get(
                        urljoin(base, page), timeout=10.0
                    )
                    if page_response.status_code == 200:
                        all_html += "\n" + page_response.text
                except Exception:
                    continue

            # Search for social media links
            for platform, patterns in COMPILED_SOCIAL_PATTERNS.items():
                for pattern in patterns:
                    matches = pattern.findall(all_html)
                    if matches:
                        handle = matches[0]
                        if isinstance(handle, tuple):
                            handle = handle[0]
                        handle = handle.strip("/").strip()
                        if handle and len(handle) > 1:
                            handles[platform] = handle
                            self._stats["handles_found"] += 1
                            break

        except Exception as e:
            pass  # Silently fail for website scraping

        self._website_handles_cache[team.name] = handles
        return handles

    # =========================================================================
    # MAIN HANDLE DISCOVERY
    # =========================================================================

    async def _find_social_handles(self, team: TeamRow) -> Dict[str, str]:
        """
        Find social media handles for a team using multiple strategies:
        1. WikiData cache lookup (fastest)
        2. WikiData direct search (if not in cache)
        3. Website scraping (fallback)
        """
        handles: Dict[str, str] = {}

        # Strategy 1: WikiData cache lookup
        wikidata_handles = self._lookup_wikidata_handles(team.name)
        if wikidata_handles:
            handles.update(wikidata_handles)
            self._stats["handles_found"] += len(wikidata_handles)

        # Strategy 2: WikiData direct search (if cache miss)
        if not handles:
            wikidata_handles = await self._search_wikidata_by_name(team.name)
            if wikidata_handles:
                handles.update(wikidata_handles)
                self._stats["handles_found"] += len(wikidata_handles)

        # Strategy 3: Website scraping (fallback for missing handles)
        if not handles or len(handles) < 3:  # Try website if few handles found
            website_handles = await self._find_social_handles_from_website(team)
            for platform, handle in website_handles.items():
                if platform not in handles:
                    handles[platform] = handle

        return handles

    # =========================================================================
    # FOLLOWER COUNT SCRAPING
    # =========================================================================

    async def _scrape_follower_count_playwright(
        self, platform: str, handle: str
    ) -> Optional[int]:
        """Scrape follower count from a social media profile using Playwright."""
        if not self._context or not handle:
            return None

        # Determine the correct URL format
        if platform == "youtube" and handle.startswith("UC"):
            url = SOCIAL_PROFILE_URLS["youtube_channel"].format(handle=handle)
        else:
            url_template = SOCIAL_PROFILE_URLS.get(platform)
            if not url_template:
                return None
            url = url_template.format(handle=handle)

        page: Optional[Page] = None

        try:
            page = await self._context.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(2)

            follower_count = await self._extract_follower_count(page, platform)

            if follower_count:
                self._stats["profiles_scraped"] += 1
                return follower_count
            else:
                self._stats["profiles_failed"] += 1
                return None

        except PlaywrightTimeout:
            self._stats["profiles_failed"] += 1
            return None
        except Exception as e:
            self._stats["profiles_failed"] += 1
            return None
        finally:
            if page:
                await page.close()

    async def _extract_follower_count(self, page: Page, platform: str) -> Optional[int]:
        """Extract follower count from a loaded page based on platform."""
        selectors = FOLLOWER_SELECTORS.get(platform, [])

        for selector in selectors:
            try:
                element = await page.query_selector(selector)
                if element:
                    text = await element.text_content()
                    if text:
                        count = parse_follower_count(text)
                        if count and count > 0:
                            return count
            except Exception:
                continue

        # Platform-specific extraction methods
        if platform == "x":
            return await self._extract_x_followers(page)
        elif platform == "instagram":
            return await self._extract_instagram_followers(page)
        elif platform == "youtube":
            return await self._extract_youtube_subscribers(page)
        elif platform == "tiktok":
            return await self._extract_tiktok_followers(page)
        elif platform == "facebook":
            return await self._extract_facebook_followers(page)

        return None

    async def _extract_x_followers(self, page: Page) -> Optional[int]:
        """Extract follower count from X/Twitter profile."""
        try:
            await page.wait_for_selector('[data-testid="primaryColumn"]', timeout=10000)

            follower_link = await page.query_selector(
                'a[href$="/verified_followers"], a[href$="/followers"]'
            )
            if follower_link:
                text = await follower_link.text_content()
                if text:
                    count = parse_follower_count(text)
                    if count:
                        return count

            content = await page.content()
            match = re.search(r'"followers_count"\s*:\s*(\d+)', content)
            if match:
                return int(match.group(1))

            meta = await page.query_selector('meta[name="description"]')
            if meta:
                desc = await meta.get_attribute("content")
                if desc:
                    match = re.search(
                        r"([\d,.]+[KMB]?)\s*Followers", desc, re.IGNORECASE
                    )
                    if match:
                        return parse_follower_count(match.group(1))
        except Exception:
            pass
        return None

    async def _extract_instagram_followers(self, page: Page) -> Optional[int]:
        """Extract follower count from Instagram profile."""
        try:
            meta = await page.query_selector('meta[property="og:description"]')
            if meta:
                content = await meta.get_attribute("content")
                if content:
                    match = re.search(
                        r"([\d,.]+[KMB]?)\s*Followers", content, re.IGNORECASE
                    )
                    if match:
                        return parse_follower_count(match.group(1))

            content = await page.content()
            match = re.search(
                r'"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)', content
            )
            if match:
                return int(match.group(1))

            match = re.search(r'"follower_count"\s*:\s*(\d+)', content)
            if match:
                return int(match.group(1))
        except Exception:
            pass
        return None

    async def _extract_youtube_subscribers(self, page: Page) -> Optional[int]:
        """Extract subscriber count from YouTube channel."""
        try:
            await page.wait_for_selector("#subscriber-count", timeout=10000)

            sub_element = await page.query_selector("#subscriber-count")
            if sub_element:
                text = await sub_element.text_content()
                if text:
                    count = parse_follower_count(text)
                    if count:
                        return count

            meta = await page.query_selector('meta[name="description"]')
            if meta:
                desc = await meta.get_attribute("content")
                if desc:
                    match = re.search(
                        r"([\d,.]+[KMB]?)\s*subscribers", desc, re.IGNORECASE
                    )
                    if match:
                        return parse_follower_count(match.group(1))
        except Exception:
            pass
        return None

    async def _extract_tiktok_followers(self, page: Page) -> Optional[int]:
        """Extract follower count from TikTok profile."""
        try:
            await asyncio.sleep(3)

            follower_elem = await page.query_selector('[data-e2e="followers-count"]')
            if follower_elem:
                text = await follower_elem.text_content()
                if text:
                    count = parse_follower_count(text)
                    if count:
                        return count

            content = await page.content()
            match = re.search(r'"followerCount"\s*:\s*(\d+)', content)
            if match:
                return int(match.group(1))
        except Exception:
            pass
        return None

    async def _extract_facebook_followers(self, page: Page) -> Optional[int]:
        """Extract follower count from Facebook page."""
        try:
            await asyncio.sleep(2)
            content = await page.content()

            patterns = [
                r"([\d,.]+[KMB]?)\s*(?:people\s+)?follow",
                r"([\d,.]+[KMB]?)\s*followers",
                r'"follower_count"\s*:\s*(\d+)',
            ]

            for pattern in patterns:
                match = re.search(pattern, content, re.IGNORECASE)
                if match:
                    count = parse_follower_count(match.group(1))
                    if count:
                        return count
        except Exception:
            pass
        return None

    # =========================================================================
    # API METHODS
    # =========================================================================

    async def _get_followers_via_api(self, platform: str, handle: str) -> Optional[int]:
        """Get follower count via official API (when keys available)."""
        if platform == "youtube" and self.api_keys.get("youtube"):
            return await self._get_youtube_subscribers_api(handle)
        return None

    async def _get_youtube_subscribers_api(self, handle: str) -> Optional[int]:
        """Get YouTube subscribers via Data API."""
        api_key = self.api_keys.get("youtube")
        if not api_key or not self._http_client:
            return None

        try:
            # If handle is a channel ID (starts with UC), use it directly
            if handle.startswith("UC"):
                channel_id = handle
            else:
                # Search for channel
                search_url = "https://www.googleapis.com/youtube/v3/search"
                params = {
                    "part": "snippet",
                    "type": "channel",
                    "q": handle,
                    "key": api_key,
                    "maxResults": 1,
                }

                response = await self._http_client.get(search_url, params=params)
                response.raise_for_status()
                data = response.json()
                self._stats["api_calls"] += 1

                if not data.get("items"):
                    return None

                channel_id = data["items"][0]["id"].get("channelId")
                if not channel_id:
                    return None

            # Get channel statistics
            channel_url = "https://www.googleapis.com/youtube/v3/channels"
            params = {
                "part": "statistics",
                "id": channel_id,
                "key": api_key,
            }

            response = await self._http_client.get(channel_url, params=params)
            response.raise_for_status()
            data = response.json()
            self._stats["api_calls"] += 1

            if data.get("items"):
                stats = data["items"][0].get("statistics", {})
                sub_count = stats.get("subscriberCount")
                if sub_count:
                    return int(sub_count)

        except Exception as e:
            self._stats["api_errors"] += 1

        return None

    # =========================================================================
    # MAIN ENRICHMENT
    # =========================================================================

    async def _enrich_team(self, team: TeamRow, sources: SourceCollector) -> bool:
        """Enrich a single team with social media handles and follower counts."""
        self._stats["teams_processed"] += 1
        enriched = False

        # Skip if all social fields already populated
        if (
            team.social_handles is not None
            and len(team.social_handles) > 0
            and all(
                [
                    team.followers_x is not None,
                    team.followers_instagram is not None,
                    team.followers_facebook is not None,
                    team.followers_tiktok is not None,
                    team.subscribers_youtube is not None,
                ]
            )
        ):
            return False

        # Step 1: Find social media handles
        handles = await self._find_social_handles(team)

        if not handles:
            return False

        # Track the source of handle discovery
        # WikiData is the primary source when available
        if self._wikidata_handles_cache:
            sources.add_database_source(
                url="https://query.wikidata.org/sparql",
                source_name=SourceNames.WIKIDATA_SPARQL,
                fields=["social_handles"],
            )
        elif team.official_url:
            # Handles came from website scraping
            sources.add_website_source(
                url=team.official_url,
                source_name=SourceNames.TEAM_WEBSITE,
                fields=["social_handles"],
            )

        # Step 2: Store handles in structured format
        if team.social_handles is None:
            team.social_handles = []

        # URL templates for each platform
        url_templates = {
            "x": "https://x.com/{handle}",
            "instagram": "https://www.instagram.com/{handle}/",
            "facebook": "https://www.facebook.com/{handle}/",
            "tiktok": "https://www.tiktok.com/@{handle}",
            "youtube": "https://www.youtube.com/channel/{handle}",
            "youtube_handle": "https://www.youtube.com/@{handle}",
        }

        # Build social handles list
        existing_platforms = {h.get("platform") for h in team.social_handles}

        for platform, handle in handles.items():
            if platform in existing_platforms:
                continue

            # Build the handle info
            handle_info = {
                "platform": platform,
                "handle": handle,
            }

            # Generate URL
            if platform == "youtube":
                # YouTube channel IDs start with UC
                if handle.startswith("UC"):
                    handle_info["url"] = url_templates["youtube"].format(handle=handle)
                    handle_info["unique_id"] = handle  # Channel ID is the stable ID
                else:
                    handle_info["url"] = url_templates["youtube_handle"].format(
                        handle=handle
                    )
            else:
                url_template = url_templates.get(platform)
                if url_template:
                    handle_info["url"] = url_template.format(handle=handle)

            team.social_handles.append(handle_info)
            enriched = True

        # Step 3: For each platform, get follower count
        field_map = {
            "x": "followers_x",
            "instagram": "followers_instagram",
            "facebook": "followers_facebook",
            "tiktok": "followers_tiktok",
            "youtube": "subscribers_youtube",
        }

        # Platform source name mapping
        platform_source_names = {
            "x": SourceNames.X_PROFILE,
            "instagram": SourceNames.INSTAGRAM_PROFILE,
            "facebook": SourceNames.FACEBOOK_PROFILE,
            "tiktok": SourceNames.TIKTOK_PROFILE,
            "youtube": SourceNames.YOUTUBE_CHANNEL,
        }

        for platform, handle in handles.items():
            field_name = field_map.get(platform)
            if not field_name:
                continue

            current_value = getattr(team, field_name, None)
            if current_value is not None:
                continue

            # Try API first
            count = await self._get_followers_via_api(platform, handle)

            # Fall back to Playwright scraping
            if count is None and self._context:
                count = await self._scrape_follower_count_playwright(platform, handle)

            if count is not None and count > 0:
                setattr(team, field_name, count)
                enriched = True
                self._stats["platform_counts"][platform] = (
                    self._stats["platform_counts"].get(platform, 0) + 1
                )

                # Track the profile as a source for follower count
                profile_url = url_templates.get(platform, "").format(handle=handle)
                if platform == "youtube" and handle.startswith("UC"):
                    profile_url = url_templates["youtube"].format(handle=handle)
                elif platform == "youtube":
                    profile_url = url_templates["youtube_handle"].format(handle=handle)

                if profile_url:
                    sources.add_website_source(
                        url=profile_url,
                        source_name=platform_source_names.get(
                            platform, f"{platform.title()} Profile"
                        ),
                        fields=[field_name],
                    )

            await asyncio.sleep(0.5)

        return enriched

    async def enrich(
        self, teams: List[TeamRow], progress_callback=None
    ) -> EnrichmentResult:
        """Override enrich to add detailed reporting in the result."""
        result = await super().enrich(teams, progress_callback=progress_callback)

        if result.success:
            result.details = {
                "teams_processed": self._stats["teams_processed"],
                "wikidata_queries": self._stats["wikidata_queries"],
                "wikidata_teams_found": self._stats["wikidata_teams_found"],
                "wikidata_cache_hits": self._stats["wikidata_cache_hits"],
                "website_scrapes": self._stats["website_scrapes"],
                "handles_found": self._stats["handles_found"],
                "profiles_scraped": self._stats["profiles_scraped"],
                "profiles_failed": self._stats["profiles_failed"],
                "api_calls": self._stats["api_calls"],
                "api_errors": self._stats["api_errors"],
                "platform_counts": dict(self._stats["platform_counts"]),
                "api_keys_available": {k: bool(v) for k, v in self.api_keys.items()},
            }

        return result
