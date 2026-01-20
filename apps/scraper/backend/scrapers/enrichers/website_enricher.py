"""
Website Enricher for family friendliness metrics.

Scrapes team websites for family-oriented content and programs,
detecting keywords and patterns that indicate family-friendly initiatives.

Fields added:
- family_program_count: Number of family programs detected
- family_program_types: List of program types found (e.g., "Kids Club", "Family Pack")
"""

from __future__ import annotations

import asyncio
import re
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from .base import BaseEnricher, EnricherConfig, EnricherRegistry
from ..models import TeamRow, EnrichmentResult
from ..source_collector import SourceCollector, SourceNames


# =============================================================================
# FAMILY FRIENDLINESS DETECTION PATTERNS
# =============================================================================

# URL paths commonly associated with family/kids content
FAMILY_URL_PATTERNS = [
    "/kids",
    "/kids-club",
    "/kidsclub",
    "/junior",
    "/junior-fan",
    "/youth",
    "/youth-programs",
    "/family",
    "/families",
    "/family-zone",
    "/family-fun",
    "/community/youth",
    "/community/kids",
    "/tickets/family",
    "/tickets/kids",
    "/fan-zone/kids",
    "/fan-experience/family",
    "/camps",
    "/youth-camps",
    "/summer-camps",
    "/baseball-camps",
    "/basketball-camps",
    "/hockey-camps",
    "/football-camps",
    "/clinics",
]

# Keywords to detect in page content (case-insensitive)
# Grouped by program type for categorization
FAMILY_KEYWORD_PATTERNS: Dict[str, List[str]] = {
    "Kids Club": [
        r"kids?\s*club",
        r"junior\s*fan\s*club",
        r"jr\.?\s*fan\s*club",
        r"young\s*fans?\s*club",
        r"little\s*league\s*fan",
        r"kids?\s*zone",
        r"kid\s*nation",
        r"junior\s*crew",
        r"youth\s*club",
        r"fan\s*club.*kids",
        r"kids\s*corner",
        r"kids\s*experience",
    ],
    "Family Pack": [
        r"family\s*pack(?:age)?s?",
        r"family\s*ticket\s*pack",
        r"family\s*deal",
        r"family\s*bundle",
        r"family\s*plan",
        r"family\s*fun\s*pack",
        r"4[\-\s]pack.*family",
        r"family\s*4[\-\s]pack",
        r"family\s*value\s*pack",
        r"family\s*night\s*pack",
    ],
    "Youth Night": [
        r"youth\s*night",
        r"kids?\s*night",
        r"kids?\s*day",
        r"junior\s*night",
        r"school\s*night",
        r"education\s*day",
        r"student\s*night",
        r"kids?\s*eat\s*free",
        r"children\s*eat\s*free",
        r"kids?\s*run\s*the\s*bases?",
        r"family\s*sunday",
        r"family\s*friday",
        r"family\s*night",
    ],
    "Youth Academy": [
        r"youth\s*academy",
        r"youth\s*program",
        r"youth\s*development",
        r"youth\s*sports?",
        r"youth\s*baseball",
        r"youth\s*basketball",
        r"youth\s*hockey",
        r"youth\s*football",
        r"youth\s*initiative",
        r"youth\s*outreach",
        r"little\s*league",
        r"pee\s*wee",
        r"learn\s*to\s*play",
        r"hockey\s*is\s*for\s*everyone",
        r"jr\.?\s*program",
    ],
    "Summer Camp": [
        r"summer\s*camp",
        r"sports?\s*camp",
        r"baseball\s*camp",
        r"basketball\s*camp",
        r"hockey\s*camp",
        r"football\s*camp",
        r"skills?\s*camp",
        r"day\s*camp",
        r"prospect\s*camp",
        r"youth\s*camp",
        r"kids?\s*camp",
        r"camp\s*for\s*kids",
        r"clinic\s*for\s*youth",
    ],
    "Birthday Party": [
        r"birthday\s*part(?:y|ies)",
        r"birthday\s*celebration",
        r"birthday\s*experience",
        r"birthday\s*package",
        r"party\s*package",
        r"celebrate.*birthday",
        r"host.*birthday",
        r"birthday\s*bash",
    ],
    "School Programs": [
        r"school\s*program",
        r"reading\s*program",
        r"education\s*program",
        r"field\s*trip",
        r"school\s*field\s*trip",
        r"educational\s*tour",
        r"school\s*group",
        r"classroom\s*program",
        r"stem\s*program",
        r"student\s*program",
        r"grade\s*school",
        r"elementary\s*school",
    ],
    "Mascot Programs": [
        r"mascot\s*visit",
        r"mascot\s*appearance",
        r"meet\s*the\s*mascot",
        r"mascot\s*birthday",
        r"mascot\s*school\s*visit",
        r"character\s*visit",
    ],
    "Family Experience": [
        r"family\s*experience",
        r"family\s*friendly",
        r"family\s*fun",
        r"fun\s*for.*famil",
        r"great\s*for\s*families",
        r"perfect\s*for\s*families",
        r"bring\s*the\s*family",
        r"family\s*outing",
        r"family\s*entertainment",
        r"family\s*atmosphere",
        r"all\s*ages",
        r"kids?\s*friendly",
    ],
}

# Compile regex patterns for efficiency
COMPILED_PATTERNS: Dict[str, List[re.Pattern]] = {
    program_type: [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    for program_type, patterns in FAMILY_KEYWORD_PATTERNS.items()
}


@EnricherRegistry.register
class WebsiteEnricher(BaseEnricher):
    """
    Enricher that detects family-friendly content on team websites.

    Scrapes team homepages and common subpages to identify:
    - Kids clubs and youth fan programs
    - Family ticket packages and deals
    - Youth nights and special events
    - Youth academies and development programs
    - Summer camps and clinics
    - Birthday party offerings
    - School programs and field trips
    - Mascot visits and appearances

    Fields added:
    - family_program_count: Number of distinct family programs found
    - family_program_types: List of program types detected
    """

    name = "Website Enricher"
    description = "Detects family-friendly content and programs from team websites"
    fields_added = ["family_program_count", "family_program_types"]

    def __init__(self, config: Optional[EnricherConfig] = None):
        """Initialize with optional configuration."""
        super().__init__(config)

        # HTTP client (initialized in _pre_enrich)
        self._client: Optional[httpx.AsyncClient] = None

        # Track statistics
        self._stats = {
            "pages_fetched": 0,
            "pages_failed": 0,
            "teams_with_programs": 0,
            "program_type_counts": {},
        }

    def is_available(self) -> bool:
        """Check if the enricher can run (always available)."""
        return True

    async def _pre_enrich(self, teams: List[TeamRow]) -> None:
        """Initialize HTTP client before processing."""
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.config.request_timeout_s),
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        # Reset stats
        self._stats = {
            "pages_fetched": 0,
            "pages_failed": 0,
            "teams_with_programs": 0,
            "program_type_counts": {},
        }

    async def _post_enrich(self, teams: List[TeamRow]) -> None:
        """Close HTTP client and log summary."""
        if self._client:
            await self._client.aclose()
            self._client = None

        # Log summary
        print("\n📊 Website Enricher Summary:")
        print(f"   Pages fetched: {self._stats['pages_fetched']}")
        print(f"   Pages failed: {self._stats['pages_failed']}")
        print(f"   Teams with family programs: {self._stats['teams_with_programs']}")

        if self._stats["program_type_counts"]:
            print("   Program types found:")
            for prog_type, count in sorted(
                self._stats["program_type_counts"].items(), key=lambda x: -x[1]
            ):
                print(f"      - {prog_type}: {count} teams")

    async def _fetch_page(self, url: str) -> Optional[str]:
        """
        Fetch a page and return its HTML content.

        Returns None if the fetch fails.
        """
        if not self._client:
            return None

        try:
            response = await self._client.get(url)
            response.raise_for_status()
            self._stats["pages_fetched"] += 1
            return response.text
        except httpx.HTTPStatusError:
            # Page doesn't exist or is forbidden
            return None
        except httpx.TimeoutException:
            self._stats["pages_failed"] += 1
            return None
        except Exception:
            self._stats["pages_failed"] += 1
            return None

    def _extract_text_content(self, html: str) -> str:
        """Extract readable text from HTML, preserving important structure."""
        soup = BeautifulSoup(html, "html.parser")

        # Remove script, style, and navigation elements
        for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
            element.decompose()

        # Get text with spacing
        text = soup.get_text(separator=" ", strip=True)

        # Also get alt text from images (often contains program names)
        alt_texts = [
            img.get("alt", "") for img in soup.find_all("img") if img.get("alt")
        ]
        text += " " + " ".join(alt_texts)

        # Get link text and titles
        for link in soup.find_all("a", href=True):
            title = link.get("title", "")
            if title:
                text += " " + title

        return text.lower()

    def _detect_programs(self, text: str) -> Set[str]:
        """
        Detect family program types mentioned in text.

        Returns a set of program type names found.
        """
        found_types: Set[str] = set()

        for program_type, patterns in COMPILED_PATTERNS.items():
            for pattern in patterns:
                if pattern.search(text):
                    found_types.add(program_type)
                    break  # Found this type, move to next

        return found_types

    def _find_family_urls(self, html: str, base_url: str) -> List[str]:
        """
        Find URLs that might lead to family/kids content.

        Returns a list of absolute URLs to check.
        """
        soup = BeautifulSoup(html, "html.parser")
        parsed_base = urlparse(base_url)
        base = f"{parsed_base.scheme}://{parsed_base.netloc}"

        found_urls: Set[str] = set()

        # Check all links
        for link in soup.find_all("a", href=True):
            href = link.get("href", "").lower()
            link_text = link.get_text().lower()

            # Check if link or text contains family/kids keywords
            family_keywords = [
                "kids",
                "family",
                "youth",
                "junior",
                "camp",
                "birthday",
                "school",
            ]

            if any(kw in href or kw in link_text for kw in family_keywords):
                # Build absolute URL
                full_url = link.get("href", "")
                if full_url.startswith("/"):
                    full_url = urljoin(base, full_url)
                elif not full_url.startswith("http"):
                    full_url = urljoin(base_url, full_url)

                # Only include URLs from the same domain
                parsed_link = urlparse(full_url)
                if parsed_link.netloc == parsed_base.netloc:
                    found_urls.add(full_url)

        return list(found_urls)[:10]  # Limit to avoid too many requests

    async def _enrich_team(self, team: TeamRow, sources: SourceCollector) -> bool:
        """
        Enrich a single team with family friendliness data.

        Scrapes the team's website and common subpages to detect
        family-oriented programs and content.
        
        Args:
            team: TeamRow to enrich (modified in place)
            sources: SourceCollector to track data sources/citations
        """
        # Skip if already has data
        if team.family_program_count is not None:
            return False

        if not team.official_url:
            return False

        all_programs: Set[str] = set()
        pages_to_check: List[str] = []

        # Build list of URLs to check
        parsed = urlparse(team.official_url)
        base = f"{parsed.scheme}://{parsed.netloc}"

        # Add common family-related paths
        for pattern in FAMILY_URL_PATTERNS[:15]:  # Limit to avoid too many requests
            pages_to_check.append(urljoin(base, pattern))

        # First, fetch the homepage to find additional links
        homepage_html = await self._fetch_page(team.official_url)
        if homepage_html:
            # Check homepage content
            homepage_text = self._extract_text_content(homepage_html)
            homepage_programs = self._detect_programs(homepage_text)
            all_programs.update(homepage_programs)

            # Find family-related links on homepage
            family_urls = self._find_family_urls(homepage_html, team.official_url)
            pages_to_check.extend(family_urls)

        # Deduplicate URLs
        pages_to_check = list(set(pages_to_check))[:15]

        # Fetch additional pages concurrently (with limit)
        async def check_page(url: str) -> Set[str]:
            html = await self._fetch_page(url)
            if html:
                text = self._extract_text_content(html)
                return self._detect_programs(text)
            return set()

        # Process pages in batches
        batch_size = 5
        for i in range(0, len(pages_to_check), batch_size):
            batch = pages_to_check[i : i + batch_size]
            results = await asyncio.gather(
                *[check_page(url) for url in batch], return_exceptions=True
            )

            for result in results:
                if isinstance(result, set):
                    all_programs.update(result)

            # Small delay between batches to be respectful
            if i + batch_size < len(pages_to_check):
                await asyncio.sleep(0.2)

        # Update team with findings
        if all_programs:
            team.family_program_types = sorted(all_programs)
            team.family_program_count = len(all_programs)
            self._stats["teams_with_programs"] += 1

            # Track program type counts
            for prog_type in all_programs:
                self._stats["program_type_counts"][prog_type] = (
                    self._stats["program_type_counts"].get(prog_type, 0) + 1
                )
            
            # Track team website as source
            sources.add_website_source(
                url=team.official_url,
                source_name=SourceNames.TEAM_WEBSITE,
                fields=["family_program_count", "family_program_types"],
            )

            return True
        else:
            # No programs found
            team.family_program_types = []
            team.family_program_count = 0
            return False

    async def enrich(self, teams: List[TeamRow], progress_callback=None) -> EnrichmentResult:
        """Override enrich to add detailed reporting in the result."""
        result = await super().enrich(teams, progress_callback=progress_callback)

        if result.success:
            result.details = {
                "pages_fetched": self._stats["pages_fetched"],
                "pages_failed": self._stats["pages_failed"],
                "teams_with_programs": self._stats["teams_with_programs"],
                "program_type_counts": dict(self._stats["program_type_counts"]),
            }

        return result
