"""
Brand Alignment Enricher for team data.

Scrapes team websites for CSR, community, and cause-related content,
then uses Gemini AI to extract and categorize brand alignment information.

Fields added:
- mission_tags: Tags describing the team's mission focus areas
- community_programs: List of community programs/initiatives
- cause_partnerships: List of cause/charity partnerships
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


# =============================================================================
# API CONFIGURATION
# =============================================================================

GEMINI_API_KEY_VAR = "GOOGLE_GENERATIVE_AI_API_KEY"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


# =============================================================================
# CSR/COMMUNITY PAGE URL PATTERNS
# =============================================================================

# URL paths commonly associated with CSR and community content
COMMUNITY_URL_PATTERNS = [
    # Community pages
    "/community",
    "/community-relations",
    "/community-outreach",
    "/community-impact",
    "/in-the-community",
    "/our-community",
    # Foundation pages
    "/foundation",
    "/team-foundation",
    "/charity",
    "/charities",
    "/charitable",
    "/giving",
    "/give-back",
    "/philanthropy",
    # CSR pages
    "/corporate-responsibility",
    "/social-responsibility",
    "/sustainability",
    "/csr",
    "/esg",
    "/green",
    "/environment",
    "/environmental",
    # Causes and partnerships
    "/causes",
    "/cause",
    "/partnerships/community",
    "/community-partners",
    "/non-profit",
    "/nonprofit",
    # Diversity and inclusion
    "/diversity",
    "/inclusion",
    "/dei",
    "/equity",
    "/equality",
    # Health and wellness
    "/health",
    "/wellness",
    "/mental-health",
    "/player-health",
    # About pages (often contain mission)
    "/about",
    "/about-us",
    "/who-we-are",
    "/our-mission",
    "/mission",
    "/values",
]

# Keywords that indicate CSR/community content on pages
CONTENT_KEYWORDS = [
    "community",
    "foundation",
    "charity",
    "donate",
    "volunteer",
    "outreach",
    "giving back",
    "philanthropy",
    "social impact",
    "diversity",
    "inclusion",
    "equity",
    "sustainability",
    "environment",
    "youth",
    "education",
    "health",
    "wellness",
    "veterans",
    "military",
    "first responders",
    "hunger",
    "food bank",
    "housing",
    "homeless",
    "cancer",
    "autism",
    "special needs",
    "mental health",
]


@EnricherRegistry.register
class BrandEnricher(BaseEnricher):
    """
    Enricher that extracts brand alignment and CSR information from team websites.

    Uses web scraping to gather content from community and CSR pages,
    then leverages Gemini AI to extract structured information about:
    - Mission and values tags (DEI, sustainability, youth focus, etc.)
    - Community programs and initiatives
    - Cause partnerships and charity affiliations

    Fields added:
    - mission_tags: List of tags describing mission focus areas
    - community_programs: List of community program names
    - cause_partnerships: List of cause/charity partnerships
    """

    name = "Brand Enricher"
    description = "Extracts brand alignment, CSR, and community program information using Gemini AI"
    fields_added = ["mission_tags", "community_programs", "cause_partnerships"]

    def __init__(self, config: Optional[EnricherConfig] = None):
        """Initialize with optional configuration."""
        super().__init__(config)

        # Gemini API key from config or environment
        self.gemini_api_key = self.config.api_keys.get("gemini") or os.environ.get(
            GEMINI_API_KEY_VAR, ""
        )

        # HTTP clients (initialized in _pre_enrich)
        self._web_client: Optional[httpx.AsyncClient] = None
        self._gemini_client: Optional[httpx.AsyncClient] = None

        # Track statistics
        self._stats = {
            "pages_fetched": 0,
            "pages_failed": 0,
            "gemini_extractions": 0,
            "gemini_errors": 0,
            "teams_with_data": 0,
            "mission_tag_counts": {},
        }

    def is_available(self) -> bool:
        """Check if the enricher can run."""
        # Requires Gemini API key for extraction
        return bool(self.gemini_api_key)

    async def _pre_enrich(self, teams: List[TeamRow]) -> None:
        """Initialize HTTP clients before processing."""
        self._web_client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.config.request_timeout_s),
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )

        self._gemini_client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0),  # Longer timeout for Gemini
        )

        # Reset stats
        self._stats = {
            "pages_fetched": 0,
            "pages_failed": 0,
            "gemini_extractions": 0,
            "gemini_errors": 0,
            "teams_with_data": 0,
            "mission_tag_counts": {},
        }

    async def _post_enrich(self, teams: List[TeamRow]) -> None:
        """Close HTTP clients and log summary."""
        if self._web_client:
            await self._web_client.aclose()
            self._web_client = None
        if self._gemini_client:
            await self._gemini_client.aclose()
            self._gemini_client = None

        # Log summary
        print("\n📊 Brand Enricher Summary:")
        print(f"   Pages fetched: {self._stats['pages_fetched']}")
        print(f"   Pages failed: {self._stats['pages_failed']}")
        print(f"   Gemini extractions: {self._stats['gemini_extractions']}")
        print(f"   Gemini errors: {self._stats['gemini_errors']}")
        print(f"   Teams with brand data: {self._stats['teams_with_data']}")

        if self._stats["mission_tag_counts"]:
            print("   Top mission tags:")
            sorted_tags = sorted(
                self._stats["mission_tag_counts"].items(), key=lambda x: -x[1]
            )[:10]
            for tag, count in sorted_tags:
                print(f"      - {tag}: {count} teams")

    async def _fetch_page(self, url: str) -> Optional[str]:
        """Fetch a page and return its HTML content."""
        if not self._web_client:
            return None

        try:
            response = await self._web_client.get(url)
            response.raise_for_status()
            self._stats["pages_fetched"] += 1
            return response.text
        except httpx.HTTPStatusError:
            return None
        except httpx.TimeoutException:
            self._stats["pages_failed"] += 1
            return None
        except Exception:
            self._stats["pages_failed"] += 1
            return None

    def _extract_text_content(self, html: str) -> str:
        """Extract readable text from HTML."""
        soup = BeautifulSoup(html, "html.parser")

        # Remove script, style, and navigation elements
        for element in soup(["script", "style", "nav", "footer", "header"]):
            element.decompose()

        # Get main content text
        text = soup.get_text(separator="\n", strip=True)

        # Also get alt text from images
        alt_texts = [
            img.get("alt", "") for img in soup.find_all("img") if img.get("alt")
        ]
        if alt_texts:
            text += "\n\nImage descriptions: " + ", ".join(alt_texts)

        return text

    def _is_community_relevant(self, text: str) -> bool:
        """Check if page content is relevant for community/CSR extraction."""
        text_lower = text.lower()
        return any(keyword in text_lower for keyword in CONTENT_KEYWORDS)

    def _find_community_links(self, html: str, base_url: str) -> List[str]:
        """Find URLs that might lead to community/CSR content."""
        soup = BeautifulSoup(html, "html.parser")
        parsed_base = urlparse(base_url)
        base = f"{parsed_base.scheme}://{parsed_base.netloc}"

        found_urls: Set[str] = set()

        for link in soup.find_all("a", href=True):
            href = link.get("href", "").lower()
            link_text = link.get_text().lower()

            community_keywords = [
                "community",
                "foundation",
                "charity",
                "giving",
                "cause",
                "diversity",
                "sustainability",
                "csr",
                "responsibility",
                "impact",
                "outreach",
                "volunteer",
            ]

            if any(kw in href or kw in link_text for kw in community_keywords):
                full_url = link.get("href", "")
                if full_url.startswith("/"):
                    full_url = urljoin(base, full_url)
                elif not full_url.startswith("http"):
                    full_url = urljoin(base_url, full_url)

                parsed_link = urlparse(full_url)
                if parsed_link.netloc == parsed_base.netloc:
                    found_urls.add(full_url)

        return list(found_urls)[:10]

    async def _extract_with_gemini(
        self, team_name: str, combined_content: str
    ) -> Optional[Dict[str, Any]]:
        """
        Use Gemini to extract structured brand alignment information.

        Returns a dictionary with:
        - mission_tags: List of mission/value focus areas
        - community_programs: List of community programs
        - cause_partnerships: List of cause partnerships
        """
        if not self.gemini_api_key or not self._gemini_client:
            return None

        # Truncate content if too long (Gemini has token limits)
        max_content_length = 15000
        if len(combined_content) > max_content_length:
            combined_content = combined_content[:max_content_length] + "\n...[truncated]"

        prompt = f"""You are analyzing the community, foundation, and CSR (corporate social responsibility) pages for the {team_name} sports team.

Based on the following content from their website, extract structured information about their brand alignment and community involvement.

Content:
{combined_content}

Please extract and return a JSON object with these three arrays:

1. "mission_tags": Tags that describe the team's mission focus areas. Use ONLY from this standardized list:
   - "Youth Development" (youth programs, education, mentorship)
   - "Health & Wellness" (health initiatives, fitness, mental health)
   - "Diversity & Inclusion" (DEI initiatives, equity, representation)
   - "Environmental Sustainability" (green initiatives, climate action)
   - "Veterans & Military" (military appreciation, veteran support)
   - "Hunger Relief" (food banks, meal programs, nutrition)
   - "Education" (scholarships, school programs, literacy)
   - "Community Development" (neighborhood improvement, local investment)
   - "First Responders" (police, fire, EMS support)
   - "Social Justice" (advocacy, criminal justice reform)
   - "Cancer Awareness" (cancer research, patient support)
   - "Special Needs" (autism, disabilities support)
   - "Economic Empowerment" (job training, entrepreneurship)
   - "Arts & Culture" (cultural programs, arts education)
   - "Housing & Homelessness" (housing assistance, homeless support)

2. "community_programs": Specific named programs or initiatives run by the team. Include the actual program name if mentioned (e.g., "Yankees HOPE Week", "Lakers Youth Foundation", "Blackhawks Community Fund").

3. "cause_partnerships": Named charity partners or cause-related partnerships. Include organization names (e.g., "Make-A-Wish", "Boys & Girls Clubs", "American Cancer Society").

Return ONLY a valid JSON object in this exact format:
{{
  "mission_tags": ["tag1", "tag2"],
  "community_programs": ["Program Name 1", "Program Name 2"],
  "cause_partnerships": ["Charity 1", "Charity 2"]
}}

Important:
- Only include mission_tags from the standardized list above
- For community_programs and cause_partnerships, extract actual names mentioned
- If no relevant information is found for a category, return an empty array []
- Return ONLY the JSON object, no explanation or markdown"""

        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 2048,
            },
        }

        try:
            response = await self._gemini_client.post(
                f"{GEMINI_API_URL}?key={self.gemini_api_key}",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()

            result = response.json()
            text = result["candidates"][0]["content"]["parts"][0]["text"]

            # Clean up response
            text = text.strip()
            if text.startswith("```"):
                # Remove markdown code fences
                lines = text.split("\n")
                text = "\n".join(
                    line
                    for line in lines
                    if not line.startswith("```")
                )
                text = text.strip()

            # Parse JSON
            extracted = json.loads(text)

            # Validate structure
            if not isinstance(extracted, dict):
                return None

            # Ensure all expected keys exist
            result_data = {
                "mission_tags": extracted.get("mission_tags", []),
                "community_programs": extracted.get("community_programs", []),
                "cause_partnerships": extracted.get("cause_partnerships", []),
            }

            # Validate arrays
            for key in result_data:
                if not isinstance(result_data[key], list):
                    result_data[key] = []
                # Filter to strings only
                result_data[key] = [
                    str(item) for item in result_data[key] if item
                ]

            self._stats["gemini_extractions"] += 1
            return result_data

        except httpx.HTTPStatusError as e:
            print(f"Gemini API error for {team_name}: {e.response.status_code}")
            self._stats["gemini_errors"] += 1
            return None
        except json.JSONDecodeError as e:
            print(f"Failed to parse Gemini response for {team_name}: {e}")
            self._stats["gemini_errors"] += 1
            return None
        except Exception as e:
            print(f"Unexpected error for {team_name}: {e}")
            self._stats["gemini_errors"] += 1
            return None

    async def _enrich_team(self, team: TeamRow) -> bool:
        """
        Enrich a single team with brand alignment data.

        Scrapes community/CSR pages and uses Gemini to extract
        structured information about mission, programs, and partnerships.
        """
        # Skip if already has data
        if team.mission_tags is not None:
            return False

        if not team.official_url:
            return False

        # Collect content from multiple pages
        all_content: List[str] = []
        pages_to_check: List[str] = []

        parsed = urlparse(team.official_url)
        base = f"{parsed.scheme}://{parsed.netloc}"

        # Add known community/CSR path patterns
        for pattern in COMMUNITY_URL_PATTERNS[:20]:
            pages_to_check.append(urljoin(base, pattern))

        # Fetch homepage first to find additional links
        homepage_html = await self._fetch_page(team.official_url)
        if homepage_html:
            # Find community-related links on homepage
            community_links = self._find_community_links(homepage_html, team.official_url)
            pages_to_check.extend(community_links)

        # Deduplicate and limit
        pages_to_check = list(set(pages_to_check))[:20]

        # Fetch pages concurrently
        async def fetch_and_extract(url: str) -> Optional[str]:
            html = await self._fetch_page(url)
            if html:
                text = self._extract_text_content(html)
                if self._is_community_relevant(text):
                    return text
            return None

        # Process in batches
        batch_size = 5
        for i in range(0, len(pages_to_check), batch_size):
            batch = pages_to_check[i : i + batch_size]
            results = await asyncio.gather(
                *[fetch_and_extract(url) for url in batch], return_exceptions=True
            )

            for result in results:
                if isinstance(result, str) and result:
                    all_content.append(result)

            # Small delay between batches
            if i + batch_size < len(pages_to_check):
                await asyncio.sleep(0.2)

        # If we found relevant content, use Gemini to extract
        if all_content:
            # Combine all content
            combined = f"\n\n--- PAGE BREAK ---\n\n".join(all_content)

            # Extract with Gemini
            extracted = await self._extract_with_gemini(team.name, combined)

            if extracted:
                team.mission_tags = extracted.get("mission_tags", [])
                team.community_programs = extracted.get("community_programs", [])
                team.cause_partnerships = extracted.get("cause_partnerships", [])

                # Track statistics
                if team.mission_tags or team.community_programs or team.cause_partnerships:
                    self._stats["teams_with_data"] += 1

                    # Count mission tags
                    for tag in (team.mission_tags or []):
                        self._stats["mission_tag_counts"][tag] = (
                            self._stats["mission_tag_counts"].get(tag, 0) + 1
                        )

                return True

        # No relevant content found
        team.mission_tags = []
        team.community_programs = []
        team.cause_partnerships = []
        return False

    async def enrich(self, teams: List[TeamRow]) -> EnrichmentResult:
        """Override enrich to add detailed reporting in the result."""
        result = await super().enrich(teams)

        if result.success:
            result.details = {
                "pages_fetched": self._stats["pages_fetched"],
                "pages_failed": self._stats["pages_failed"],
                "gemini_extractions": self._stats["gemini_extractions"],
                "gemini_errors": self._stats["gemini_errors"],
                "teams_with_data": self._stats["teams_with_data"],
                "mission_tag_counts": dict(self._stats["mission_tag_counts"]),
            }

        return result
