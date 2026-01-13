"""
Enrichers module for adding additional metrics to scraped team data.

Each enricher is a standalone module that:
1. Takes a list of TeamRow objects
2. Adds nullable fields from its domain
3. Returns the enriched list

Available Enrichers:
- GeoEnricher: Adds city_population and metro_gdp_millions
- SocialEnricher: Adds social media follower counts
- WebsiteEnricher: Adds family friendliness metrics
- SponsorEnricher: Adds stadium and sponsor information
- ValuationEnricher: Adds pricing and valuation data
- BrandEnricher: Adds mission and community program tags
"""

from .base import BaseEnricher, EnricherRegistry
from .geo_enricher import GeoEnricher

__all__ = [
    "BaseEnricher",
    "EnricherRegistry",
    "GeoEnricher",
]
