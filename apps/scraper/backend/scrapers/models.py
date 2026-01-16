"""
Shared data models for team scrapers and enrichers.

This module contains the extended TeamRow dataclass that supports both
core scraping fields and enrichment layers for additional metrics.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict, fields
from typing import Any, Dict, List, Optional
from datetime import datetime


@dataclass
class SocialHandle:
    """
    Represents a social media handle for a team.

    Stores the username/handle and any stable unique ID if available.
    For YouTube, the channel_id IS the stable ID (starts with UC).
    For other platforms, usernames may change but we store what's available.
    """

    platform: str  # "x", "instagram", "facebook", "tiktok", "youtube"
    handle: str  # Username/handle (e.g., "Lakers", "yankees")
    url: Optional[str] = None  # Full profile URL
    unique_id: Optional[str] = None  # Stable ID if available (YouTube channel ID)


@dataclass
class SponsorInfo:
    """Represents a sponsor partnership."""

    name: str
    category: Optional[str] = None  # e.g., "Apparel", "Beverage", "Financial"
    asset_type: Optional[str] = (
        None  # e.g., "Jersey Patch", "Naming Rights", "Official Partner"
    )


@dataclass
class TeamRow:
    """
    Extended team data model supporting core fields and enrichment layers.

    Core Fields (Phase 1 - Base Scraping):
        - name, region, league, target_demographic, official_url, category, logo_url

    Geographic Fields (Phase 2 - GeoEnricher):
        - city_population, metro_gdp_millions

    Social/Audience Fields (Phase 3 - SocialEnricher):
        - followers_x, followers_instagram, followers_facebook, followers_tiktok
        - subscribers_youtube, avg_game_attendance

    Family Friendliness Fields (Phase 4 - WebsiteEnricher):
        - family_program_count, family_program_types

    Inventory/Sponsors Fields (Phase 5 - SponsorEnricher):
        - owns_stadium, stadium_name, sponsors

    Pricing/Valuation Fields (Phase 6 - ValuationEnricher):
        - avg_ticket_price, franchise_value_millions, annual_revenue_millions

    Brand Alignment Fields (Phase 7 - BrandEnricher):
        - mission_tags, community_programs, cause_partnerships
    """

    # ========== Core Fields (existing) ==========
    name: str
    region: str
    league: str
    target_demographic: str
    official_url: str
    category: str
    logo_url: Optional[str] = None

    # ========== Geographic (Phase 2) ==========
    geo_city: Optional[str] = None  # Resolved city name for population lookup
    geo_country: Optional[str] = None  # Country code (US, CA, MX, DO, etc.)
    city_population: Optional[int] = None
    metro_gdp_millions: Optional[float] = None

    # ========== Social/Audience (Phase 3) ==========
    # Social handles with platform info
    social_handles: Optional[List[Dict[str, Any]]] = (
        None  # List of SocialHandle as dicts
    )
    # Follower counts
    followers_x: Optional[int] = None
    followers_instagram: Optional[int] = None
    followers_facebook: Optional[int] = None
    followers_tiktok: Optional[int] = None
    subscribers_youtube: Optional[int] = None
    avg_game_attendance: Optional[int] = None

    # ========== Family Friendliness (Phase 4) ==========
    family_program_count: Optional[int] = None
    family_program_types: Optional[List[str]] = None

    # ========== Inventory/Sponsors (Phase 5) ==========
    owns_stadium: Optional[bool] = None
    stadium_name: Optional[str] = None
    sponsors: Optional[List[Dict[str, Any]]] = None  # List of SponsorInfo as dicts

    # ========== Pricing/Valuation (Phase 6) ==========
    avg_ticket_price: Optional[float] = None
    franchise_value_millions: Optional[float] = None
    annual_revenue_millions: Optional[float] = None

    # ========== Brand Alignment (Phase 7) ==========
    mission_tags: Optional[List[str]] = None
    community_programs: Optional[List[str]] = None
    cause_partnerships: Optional[List[str]] = None

    # ========== Enrichment Metadata ==========
    enrichments_applied: Optional[List[str]] = None  # Track which enrichers have run
    last_enriched: Optional[str] = None  # ISO timestamp of last enrichment

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, handling nested dataclasses."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TeamRow":
        """Create TeamRow from dictionary, with safe handling of missing fields."""
        # Filter to only known fields
        known_fields = {f.name for f in fields(cls)}
        filtered_data = {k: v for k, v in data.items() if k in known_fields}
        return cls(**filtered_data)

    def apply_enrichment(self, enricher_name: str) -> None:
        """Mark that an enricher has been applied."""
        if self.enrichments_applied is None:
            self.enrichments_applied = []
        if enricher_name not in self.enrichments_applied:
            self.enrichments_applied.append(enricher_name)
        self.last_enriched = datetime.now().isoformat()

    def has_enrichment(self, enricher_name: str) -> bool:
        """Check if a specific enricher has been applied."""
        return (
            self.enrichments_applied is not None
            and enricher_name in self.enrichments_applied
        )


@dataclass
class ScrapeResult:
    """Result from running a scraper."""

    success: bool
    teams_count: int
    duration_ms: int
    timestamp: str
    json_path: Optional[str] = None
    xlsx_path: Optional[str] = None
    error: Optional[str] = None
    used_fallback: bool = False
    # League-specific counts (optional)
    breakdown: Optional[Dict[str, int]] = None


@dataclass
class EnrichmentResult:
    """Result from running an enricher."""

    success: bool
    enricher_name: str
    teams_processed: int
    teams_enriched: int  # Number of teams that got new data
    duration_ms: int
    timestamp: str
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None  # Enricher-specific details


# Field groupings for UI display
METRIC_GROUPS = {
    "core": {
        "label": "Core Information",
        "fields": [
            "name",
            "region",
            "league",
            "category",
            "target_demographic",
            "official_url",
            "logo_url",
        ],
        "icon": "info",
    },
    "geographic": {
        "label": "Geographic Data",
        "fields": ["geo_city", "geo_country", "city_population", "metro_gdp_millions"],
        "icon": "map",
    },
    "social": {
        "label": "Social & Audience",
        "fields": [
            "social_handles",
            "followers_x",
            "followers_instagram",
            "followers_facebook",
            "followers_tiktok",
            "subscribers_youtube",
            "avg_game_attendance",
        ],
        "icon": "users",
    },
    "family": {
        "label": "Family Friendliness",
        "fields": ["family_program_count", "family_program_types"],
        "icon": "heart",
    },
    "inventory": {
        "label": "Inventory & Sponsors",
        "fields": ["owns_stadium", "stadium_name", "sponsors"],
        "icon": "building",
    },
    "valuation": {
        "label": "Pricing & Valuation",
        "fields": [
            "avg_ticket_price",
            "franchise_value_millions",
            "annual_revenue_millions",
        ],
        "icon": "dollar",
    },
    "brand": {
        "label": "Brand Alignment",
        "fields": ["mission_tags", "community_programs", "cause_partnerships"],
        "icon": "tag",
    },
}


# Field display metadata
FIELD_METADATA = {
    "geo_city": {"label": "City", "format": "text"},
    "geo_country": {"label": "Country", "format": "text"},
    "city_population": {"label": "City Population", "format": "number"},
    "metro_gdp_millions": {"label": "Metro GDP (M)", "format": "currency"},
    "social_handles": {"label": "Social Handles", "format": "social_handles"},
    "followers_x": {"label": "X Followers", "format": "number"},
    "followers_instagram": {"label": "Instagram Followers", "format": "number"},
    "followers_facebook": {"label": "Facebook Followers", "format": "number"},
    "followers_tiktok": {"label": "TikTok Followers", "format": "number"},
    "subscribers_youtube": {"label": "YouTube Subscribers", "format": "number"},
    "avg_game_attendance": {"label": "Avg. Attendance", "format": "number"},
    "family_program_count": {"label": "Family Programs", "format": "number"},
    "family_program_types": {"label": "Program Types", "format": "list"},
    "owns_stadium": {"label": "Owns Stadium", "format": "boolean"},
    "stadium_name": {"label": "Stadium Name", "format": "text"},
    "sponsors": {"label": "Sponsors", "format": "sponsors"},
    "avg_ticket_price": {"label": "Avg. Ticket Price", "format": "currency"},
    "franchise_value_millions": {"label": "Franchise Value (M)", "format": "currency"},
    "annual_revenue_millions": {"label": "Annual Revenue (M)", "format": "currency"},
    "mission_tags": {"label": "Mission Tags", "format": "tags"},
    "community_programs": {"label": "Community Programs", "format": "list"},
    "cause_partnerships": {"label": "Cause Partnerships", "format": "list"},
}
