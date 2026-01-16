"""
Enrichers module for adding additional metrics to scraped team data.

Each enricher is a standalone module that:
1. Takes a list of TeamRow objects
2. Adds nullable fields from its domain
3. Returns the enriched list

NOTE: All monetary values are stored in RAW format (not "in millions").

Available Enrichers:
- GeoEnricher: Adds city_population and metro_gdp (raw dollars)
- SocialEnricher: Adds social_handles and follower counts (X, Instagram, Facebook, TikTok, YouTube)
- WebsiteEnricher: Adds family friendliness metrics
- SponsorEnricher: Adds stadium and sponsor information
- ValuationEnricher: Adds pricing and valuation data (raw dollars) from Forbes
- BrandEnricher: Adds mission and community program tags
"""

from .base import BaseEnricher, EnricherRegistry, EnricherConfig
from .geo_enricher import GeoEnricher
from .social_enricher import SocialEnricher
from .sponsor_enricher import SponsorEnricher
from .website_enricher import WebsiteEnricher
from .brand_enricher import BrandEnricher
from .valuation_enricher import ValuationEnricher

__all__ = [
    "BaseEnricher",
    "EnricherConfig",
    "EnricherRegistry",
    "GeoEnricher",
    "SocialEnricher",
    "SponsorEnricher",
    "WebsiteEnricher",
    "BrandEnricher",
    "ValuationEnricher",
]
