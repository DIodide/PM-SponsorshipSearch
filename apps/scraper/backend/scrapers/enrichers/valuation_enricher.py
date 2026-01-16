"""
Valuation Enricher for team pricing and franchise value data.

Adds financial metrics by scraping Forbes team pages:
- Franchise valuations directly from Forbes team profiles
- Average ticket prices from Forbes venue data
- Annual revenue figures

Fields added:
- avg_ticket_price: Average ticket price (raw dollars)
- franchise_value: Forbes estimated franchise value (raw dollars)
- annual_revenue: Forbes estimated annual revenue (raw dollars)

NOTE: All values are stored in RAW format (not "in millions").
For example, a $5.5B franchise is stored as 5500000000.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, List, Optional

import httpx
from bs4 import BeautifulSoup

from .base import BaseEnricher, EnricherConfig, EnricherRegistry
from ..models import TeamRow, EnrichmentResult


# =============================================================================
# FORBES CONFIGURATION
# =============================================================================

FORBES_BASE_URL = "https://www.forbes.com/teams"

# User agent for web requests (Forbes requires a browser-like UA)
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Major leagues that Forbes tracks
FORBES_TRACKED_LEAGUES = {
    "nfl",
    "national football league",
    "nba",
    "national basketball association",
    "mlb",
    "major league baseball",
    "american league",
    "national league",
    "nhl",
    "national hockey league",
    "mls",
    "major league soccer",
}


# =============================================================================
# TEAM NAME TO FORBES SLUG MAPPING
# =============================================================================


def team_name_to_slug(team_name: str) -> str:
    """
    Convert a team name to a Forbes URL slug.

    Examples:
        "Golden State Warriors" -> "golden-state-warriors"
        "Los Angeles Lakers" -> "los-angeles-lakers"
        "New York Yankees" -> "new-york-yankees"
    """
    # Lowercase and replace spaces with hyphens
    slug = team_name.lower().strip()
    # Remove special characters except spaces and hyphens
    slug = re.sub(r"[^\w\s-]", "", slug)
    # Replace spaces with hyphens
    slug = re.sub(r"\s+", "-", slug)
    # Remove multiple consecutive hyphens
    slug = re.sub(r"-+", "-", slug)
    return slug


def is_major_league(league: str) -> bool:
    """Check if a league is tracked by Forbes."""
    league_lower = league.lower()
    return any(tracked in league_lower for tracked in FORBES_TRACKED_LEAGUES)


def parse_money_value(text: str) -> Optional[float]:
    """
    Parse a money string like "$11B" or "$880M" into raw dollars.

    Returns value in raw dollars (e.g., "$11B" -> 11000000000.0, "$880M" -> 880000000.0)
    """
    if not text:
        return None

    # Remove whitespace and common characters
    text = text.strip().replace(",", "").replace("$", "")

    # Handle negative values
    negative = text.startswith("-") or text.startswith("−")
    text = text.lstrip("-−")

    try:
        # Check for billion -> multiply by 1,000,000,000
        if "B" in text.upper():
            value = float(text.upper().replace("B", "")) * 1_000_000_000
        # Check for million -> multiply by 1,000,000
        elif "M" in text.upper():
            value = float(text.upper().replace("M", "")) * 1_000_000
        # Check for thousand -> multiply by 1,000
        elif "K" in text.upper():
            value = float(text.upper().replace("K", "")) * 1_000
        else:
            # Assume raw number
            value = float(text)

        return -value if negative else value
    except ValueError:
        return None


def parse_ticket_price(text: str) -> Optional[float]:
    """
    Parse a ticket price string like "$285" into a float.
    """
    if not text:
        return None

    # Remove $ and commas
    text = text.strip().replace(",", "").replace("$", "")

    try:
        return float(text)
    except ValueError:
        return None


@EnricherRegistry.register
class ValuationEnricher(BaseEnricher):
    """
    Enricher that scrapes Forbes team pages for valuation data.

    Dynamically fetches franchise values, revenue, and ticket prices
    from Forbes team profiles at forbes.com/teams/{team-slug}/

    Note: Only works for major professional leagues tracked by Forbes
    (NFL, NBA, MLB, NHL, MLS).

    Fields added (all in raw dollars):
    - avg_ticket_price: Average ticket price from Forbes venue data
    - franchise_value: Forbes estimated franchise value (raw dollars)
    - annual_revenue: Forbes estimated annual revenue (raw dollars)
    """

    name = "Valuation Enricher"
    description = (
        "Scrapes Forbes team pages for franchise valuations, revenue, and ticket prices"
    )
    fields_added = [
        "avg_ticket_price",
        "franchise_value",
        "annual_revenue",
    ]

    def __init__(self, config: Optional[EnricherConfig] = None):
        """Initialize with optional configuration."""
        super().__init__(config)

        # HTTP client (initialized in _pre_enrich)
        self._client: Optional[httpx.AsyncClient] = None

        # Cache for Forbes data to avoid duplicate requests
        self._forbes_cache: Dict[str, Dict[str, Any]] = {}

        # Track statistics
        self._stats = {
            "forbes_pages_fetched": 0,
            "forbes_pages_failed": 0,
            "forbes_pages_not_found": 0,
            "valuations_found": 0,
            "revenues_found": 0,
            "ticket_prices_found": 0,
            "minor_league_skipped": 0,
        }

    def is_available(self) -> bool:
        """Check if the enricher can run (always available - web scraping)."""
        return True

    async def _pre_enrich(self, teams: List[TeamRow]) -> None:
        """Initialize HTTP client before processing."""
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0),
            follow_redirects=True,
            headers={
                "User-Agent": DEFAULT_USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
            },
        )

        # Reset stats and cache
        self._forbes_cache = {}
        self._stats = {
            "forbes_pages_fetched": 0,
            "forbes_pages_failed": 0,
            "forbes_pages_not_found": 0,
            "valuations_found": 0,
            "revenues_found": 0,
            "ticket_prices_found": 0,
            "minor_league_skipped": 0,
        }

        print("   📊 Scraping Forbes team pages for valuations...")

    async def _post_enrich(self, teams: List[TeamRow]) -> None:
        """Close HTTP client and log summary."""
        if self._client:
            await self._client.aclose()
            self._client = None

        # Log summary
        print("\n📊 Valuation Enricher Summary:")
        print(f"   Forbes pages fetched: {self._stats['forbes_pages_fetched']}")
        print(f"   Forbes pages not found: {self._stats['forbes_pages_not_found']}")
        print(f"   Forbes pages failed: {self._stats['forbes_pages_failed']}")
        print(f"   Valuations found: {self._stats['valuations_found']}")
        print(f"   Revenues found: {self._stats['revenues_found']}")
        print(f"   Ticket prices found: {self._stats['ticket_prices_found']}")
        print(f"   Minor league teams skipped: {self._stats['minor_league_skipped']}")

    async def _fetch_forbes_page(self, team_name: str) -> Optional[str]:
        """
        Fetch the Forbes team page HTML.

        Returns the HTML content or None if not found.
        """
        if not self._client:
            return None

        slug = team_name_to_slug(team_name)
        url = f"{FORBES_BASE_URL}/{slug}/"

        try:
            response = await self._client.get(url)

            if response.status_code == 404:
                self._stats["forbes_pages_not_found"] += 1
                return None

            response.raise_for_status()
            self._stats["forbes_pages_fetched"] += 1
            return response.text

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                self._stats["forbes_pages_not_found"] += 1
            else:
                self._stats["forbes_pages_failed"] += 1
                print(
                    f"   ⚠️ Forbes HTTP error for {team_name}: {e.response.status_code}"
                )
            return None
        except httpx.TimeoutException:
            self._stats["forbes_pages_failed"] += 1
            print(f"   ⚠️ Forbes timeout for {team_name}")
            return None
        except httpx.RequestError as e:
            self._stats["forbes_pages_failed"] += 1
            print(f"   ⚠️ Forbes request error for {team_name}: {e}")
            return None

    def _parse_forbes_page(self, html: str) -> Dict[str, Any]:
        """
        Parse Forbes team page HTML to extract valuation data.

        Forbes team pages have a consistent structure:
        - Team Value shown as "$11B" with "Calculated October YYYY" appended
        - Revenue shown as "$880M"
        - Average Ticket Price in Venue section as "$285"

        Extracts:
        - franchise_value: Current franchise value in millions
        - revenue: Annual revenue in millions
        - avg_ticket_price: Average ticket price
        """
        result: Dict[str, Any] = {
            "franchise_value": None,
            "revenue": None,
            "avg_ticket_price": None,
        }

        soup = BeautifulSoup(html, "html.parser")
        text_content = soup.get_text(separator=" ", strip=True)

        # =====================================================================
        # Strategy 1: Extract Team Value
        # Forbes format: "Team Value 1 $11BCalculated October 2025"
        # =====================================================================

        # Pattern matches "$XXB" or "$XX.XB" or "$XXXM" followed by "Calculated"
        value_match = re.search(
            r"\$(\d+(?:\.\d+)?)\s*([BMK])\s*[Cc]alculated", text_content
        )
        if value_match:
            num = float(value_match.group(1))
            unit = value_match.group(2).upper()
            if unit == "B":
                result["franchise_value"] = num * 1000  # Convert to millions
            elif unit == "M":
                result["franchise_value"] = num
            elif unit == "K":
                result["franchise_value"] = num / 1000

        # Fallback: Look for "Team Value" section
        if result["franchise_value"] is None:
            team_value_match = re.search(
                r"Team\s+Value[^$]*?\$(\d+(?:\.\d+)?)\s*([BMK]?)",
                text_content,
                re.IGNORECASE,
            )
            if team_value_match:
                num = float(team_value_match.group(1))
                unit = (team_value_match.group(2) or "M").upper()
                if unit == "B":
                    result["franchise_value"] = num * 1000
                elif unit == "M":
                    result["franchise_value"] = num
                elif unit == "K":
                    result["franchise_value"] = num / 1000
                else:
                    result["franchise_value"] = num

        # =====================================================================
        # Strategy 2: Extract Revenue
        # Forbes format: "Revenue 2 Net of arena revenues... $880M"
        # The footnote explanation comes between label and value
        # =====================================================================

        # Use non-greedy match to find first $ after Revenue
        revenue_match = re.search(
            r"Revenue.*?\$(\d+(?:\.\d+)?)\s*([BMK])", text_content, re.IGNORECASE
        )
        if revenue_match:
            num = float(revenue_match.group(1))
            unit = revenue_match.group(2).upper()
            if unit == "B":
                result["revenue"] = num * 1000
            elif unit == "M":
                result["revenue"] = num
            elif unit == "K":
                result["revenue"] = num / 1000

        # =====================================================================
        # Strategy 3: Extract Average Ticket Price
        # Forbes format in Venue section: "Average Ticket Price $285"
        # =====================================================================

        ticket_match = re.search(
            r"Average\s+Ticket\s+Price\s*\$(\d+(?:\.\d+)?)", text_content, re.IGNORECASE
        )
        if ticket_match:
            result["avg_ticket_price"] = float(ticket_match.group(1))

        # =====================================================================
        # Strategy 4: HTML element-based extraction (backup)
        # =====================================================================

        if result["franchise_value"] is None or result["revenue"] is None:
            # Look for divs/spans containing our target labels
            all_text_elements = soup.find_all(
                string=re.compile(r"(Team Value|Revenue|Average Ticket)", re.IGNORECASE)
            )

            for text_el in all_text_elements:
                parent = text_el.parent
                if not parent:
                    continue

                # Get the containing block and its siblings
                container = parent.parent if parent.parent else parent
                container_text = container.get_text(separator=" ", strip=True)

                # Try to extract value from the container text
                if "Team Value" in text_el and result["franchise_value"] is None:
                    match = re.search(r"\$(\d+(?:\.\d+)?)\s*([BMK])", container_text)
                    if match:
                        num = float(match.group(1))
                        unit = match.group(2).upper()
                        if unit == "B":
                            result["franchise_value"] = num * 1000
                        elif unit == "M":
                            result["franchise_value"] = num

                if "Revenue" in text_el and result["revenue"] is None:
                    match = re.search(r"\$(\d+(?:\.\d+)?)\s*([BMK])", container_text)
                    if match:
                        num = float(match.group(1))
                        unit = match.group(2).upper()
                        if unit == "B":
                            result["revenue"] = num * 1000
                        elif unit == "M":
                            result["revenue"] = num

        return result

    async def _get_forbes_data(self, team_name: str) -> Dict[str, Any]:
        """
        Get Forbes valuation data for a team.

        Uses caching to avoid duplicate requests.
        """
        # Check cache first
        cache_key = team_name_to_slug(team_name)
        if cache_key in self._forbes_cache:
            return self._forbes_cache[cache_key]

        # Fetch and parse Forbes page
        html = await self._fetch_forbes_page(team_name)

        if not html:
            self._forbes_cache[cache_key] = {}
            return {}

        data = self._parse_forbes_page(html)
        self._forbes_cache[cache_key] = data

        return data

    async def _try_alternate_names(self, team_name: str) -> Dict[str, Any]:
        """
        Try alternate team name formats if the primary name fails.

        Some teams have different Forbes page names.
        """
        # First try the original name
        data = await self._get_forbes_data(team_name)
        if data.get("franchise_value"):
            return data

        # Try removing common suffixes/prefixes
        alternates = []

        # Try just the city + nickname (e.g., "Philadelphia Eagles" from "Philadelphia Eagles Football")
        parts = team_name.split()
        if len(parts) >= 2:
            # Most common: "City Nickname" format
            alternates.append(f"{parts[0]} {parts[-1]}")

            # For multi-word cities like "Los Angeles"
            if len(parts) >= 3:
                alternates.append(f"{parts[0]} {parts[1]} {parts[-1]}")

        # Try known aliases
        name_aliases = {
            "la lakers": "los-angeles-lakers",
            "la clippers": "los-angeles-clippers",
            "la dodgers": "los-angeles-dodgers",
            "la angels": "los-angeles-angels",
            "la rams": "los-angeles-rams",
            "la chargers": "los-angeles-chargers",
            "la kings": "los-angeles-kings",
            "la galaxy": "la-galaxy",
            "ny yankees": "new-york-yankees",
            "ny mets": "new-york-mets",
            "ny giants": "new-york-giants",
            "ny jets": "new-york-jets",
            "ny knicks": "new-york-knicks",
            "ny rangers": "new-york-rangers",
            "ny islanders": "new-york-islanders",
        }

        name_lower = team_name.lower()
        for alias, slug in name_aliases.items():
            if alias in name_lower:
                # Build URL directly with known slug
                url = f"{FORBES_BASE_URL}/{slug}/"
                html = await self._fetch_forbes_page_by_url(url)
                if html:
                    data = self._parse_forbes_page(html)
                    if data.get("franchise_value"):
                        self._forbes_cache[team_name_to_slug(team_name)] = data
                        return data

        # Try alternates
        for alt_name in alternates:
            if alt_name.lower() != team_name.lower():
                # Small delay to be respectful
                await asyncio.sleep(0.3)
                data = await self._get_forbes_data(alt_name)
                if data.get("franchise_value"):
                    # Cache under original name too
                    self._forbes_cache[team_name_to_slug(team_name)] = data
                    return data

        return {}

    async def _fetch_forbes_page_by_url(self, url: str) -> Optional[str]:
        """Fetch a Forbes page directly by URL."""
        if not self._client:
            return None

        try:
            response = await self._client.get(url)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.text
        except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.RequestError):
            return None

    async def _enrich_team(self, team: TeamRow) -> bool:
        """
        Enrich a single team with Forbes valuation data.
        """
        enriched = False

        # Check if this is a major league team
        if not is_major_league(team.league):
            self._stats["minor_league_skipped"] += 1
            return False

        # Skip if already has all data
        if (
            team.franchise_value is not None
            and team.annual_revenue is not None
            and team.avg_ticket_price is not None
        ):
            return False

        # Get Forbes data
        forbes_data = await self._try_alternate_names(team.name)

        # Apply data (values are now in raw dollars)
        if team.franchise_value is None and forbes_data.get("franchise_value"):
            team.franchise_value = forbes_data["franchise_value"]
            self._stats["valuations_found"] += 1
            enriched = True

        if team.annual_revenue is None and forbes_data.get("revenue"):
            team.annual_revenue = forbes_data["revenue"]
            self._stats["revenues_found"] += 1
            enriched = True

        if team.avg_ticket_price is None and forbes_data.get("avg_ticket_price"):
            team.avg_ticket_price = forbes_data["avg_ticket_price"]
            self._stats["ticket_prices_found"] += 1
            enriched = True

        # Respectful delay between requests
        await asyncio.sleep(0.5)

        return enriched

    async def enrich(
        self, teams: List[TeamRow], progress_callback=None
    ) -> EnrichmentResult:
        """Override enrich to add detailed reporting in the result."""
        result = await super().enrich(teams, progress_callback=progress_callback)

        if result.success:
            result.details = {
                "forbes_pages_fetched": self._stats["forbes_pages_fetched"],
                "forbes_pages_not_found": self._stats["forbes_pages_not_found"],
                "forbes_pages_failed": self._stats["forbes_pages_failed"],
                "valuations_found": self._stats["valuations_found"],
                "revenues_found": self._stats["revenues_found"],
                "ticket_prices_found": self._stats["ticket_prices_found"],
                "minor_league_skipped": self._stats["minor_league_skipped"],
            }

        return result
