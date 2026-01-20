"""
Source Citation and Collection Utilities for Team Data Provenance.

This module provides standardized source tracking for all scrapers and enrichers,
enabling data provenance and verification for every team data point.

Usage:
    collector = SourceCollector("New York Yankees")
    collector.add_api_source(
        url="https://statsapi.mlb.com/api/v1/teams?sportId=1",
        source_name="MLB StatsAPI",
        endpoint="/api/v1/teams",
        fields=["name", "region", "league"]
    )
    
    # Get all sources
    sources = collector.get_sources()
    field_sources = collector.get_field_sources()
"""

from __future__ import annotations

from dataclasses import dataclass, asdict, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse


@dataclass
class SourceCitation:
    """
    Represents a single source used to collect data.
    
    Attributes:
        url: The URL/endpoint accessed
        source_type: Type of source - "api", "website", "database", "static", "cached"
        source_name: Human-readable name (e.g., "MLB StatsAPI", "WikiData SPARQL")
        retrieved_at: ISO timestamp when data was fetched
        title: Page title if scraped from website
        domain: Extracted domain for grouping
        api_endpoint: Specific API endpoint path
        query_params: Query parameters used
        fields_sourced: Which fields came from this source
        is_primary: Primary source vs fallback
        confidence: 0.0-1.0 confidence score
        cache_hit: Whether this was from cache
    """
    
    url: str
    source_type: str  # "api", "website", "database", "static", "cached"
    source_name: str
    retrieved_at: str = field(default_factory=lambda: datetime.now().isoformat())
    
    # Optional metadata
    title: Optional[str] = None
    domain: Optional[str] = None
    api_endpoint: Optional[str] = None
    query_params: Optional[Dict[str, str]] = None
    
    # Field association
    fields_sourced: Optional[List[str]] = None
    
    # Reliability indicators
    is_primary: bool = True
    confidence: Optional[float] = None
    cache_hit: bool = False
    
    def __post_init__(self):
        """Extract domain from URL if not provided."""
        if not self.domain and self.url and self.url.startswith(("http://", "https://")):
            try:
                parsed = urlparse(self.url)
                self.domain = parsed.netloc
            except Exception:
                pass
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, excluding None values."""
        result = {}
        for key, value in asdict(self).items():
            if value is not None:
                result[key] = value
        return result


class SourceCollector:
    """
    Collects and manages source citations for a team during scraping/enrichment.
    
    This class provides a standardized way to track data provenance across
    all scrapers and enrichers. It maintains both a list of all sources and
    a field-level mapping of which sources contributed to which fields.
    
    Example:
        collector = SourceCollector("Boston Red Sox")
        
        # Track API source
        collector.add_api_source(
            url="https://statsapi.mlb.com/api/v1/teams?sportId=1",
            source_name="MLB StatsAPI",
            endpoint="/api/v1/teams",
            fields=["name", "region", "league"]
        )
        
        # Track website scraping
        collector.add_website_source(
            url="https://www.redsox.com",
            source_name="Team Official Website",
            fields=["social_handles"]
        )
        
        # Get results
        sources = collector.get_sources()  # List of source dicts
        field_map = collector.get_field_sources()  # {field: [urls]}
    """
    
    def __init__(self, team_name: str):
        """
        Initialize a source collector for a specific team.
        
        Args:
            team_name: Name of the team being processed
        """
        self.team_name = team_name
        self._sources: List[SourceCitation] = []
        self._field_sources: Dict[str, Set[str]] = {}  # field -> set of URLs
    
    def add_source(
        self,
        url: str,
        source_type: str,
        source_name: str,
        fields: Optional[List[str]] = None,
        **kwargs
    ) -> None:
        """
        Add a source citation.
        
        Args:
            url: The URL/endpoint accessed
            source_type: Type of source ("api", "website", "database", "static", "cached")
            source_name: Human-readable name for the source
            fields: List of field names that were populated from this source
            **kwargs: Additional SourceCitation attributes
        """
        citation = SourceCitation(
            url=url,
            source_type=source_type,
            source_name=source_name,
            fields_sourced=fields,
            **kwargs
        )
        self._sources.append(citation)
        
        # Track field-level sources
        if fields:
            for field_name in fields:
                if field_name not in self._field_sources:
                    self._field_sources[field_name] = set()
                self._field_sources[field_name].add(url)
    
    def add_api_source(
        self,
        url: str,
        source_name: str,
        endpoint: Optional[str] = None,
        fields: Optional[List[str]] = None,
        query_params: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> None:
        """
        Convenience method for adding API sources.
        
        Args:
            url: Full API URL
            source_name: Name of the API (e.g., "MLB StatsAPI")
            endpoint: API endpoint path (e.g., "/api/v1/teams")
            fields: Fields populated from this API
            query_params: Query parameters used
            **kwargs: Additional SourceCitation attributes
        """
        self.add_source(
            url=url,
            source_type="api",
            source_name=source_name,
            api_endpoint=endpoint,
            query_params=query_params,
            fields=fields,
            **kwargs
        )
    
    def add_website_source(
        self,
        url: str,
        source_name: str,
        title: Optional[str] = None,
        fields: Optional[List[str]] = None,
        **kwargs
    ) -> None:
        """
        Convenience method for adding website scraping sources.
        
        Args:
            url: Website URL
            source_name: Descriptive name (e.g., "Team Official Website")
            title: Page title if available
            fields: Fields populated from this website
            **kwargs: Additional SourceCitation attributes
        """
        self.add_source(
            url=url,
            source_type="website",
            source_name=source_name,
            title=title,
            fields=fields,
            **kwargs
        )
    
    def add_database_source(
        self,
        url: str,
        source_name: str,
        fields: Optional[List[str]] = None,
        **kwargs
    ) -> None:
        """
        Convenience method for database/SPARQL query sources.
        
        Args:
            url: Query URL or endpoint
            source_name: Database name (e.g., "WikiData SPARQL")
            fields: Fields populated from this query
            **kwargs: Additional SourceCitation attributes
        """
        self.add_source(
            url=url,
            source_type="database",
            source_name=source_name,
            fields=fields,
            **kwargs
        )
    
    def add_static_source(
        self,
        identifier: str,
        source_name: str,
        fields: Optional[List[str]] = None,
        **kwargs
    ) -> None:
        """
        Convenience method for static/hardcoded data sources.
        
        Args:
            identifier: Internal identifier (e.g., "region-mapping-table")
            source_name: Descriptive name (e.g., "Region Mapping Table")
            fields: Fields populated from this static source
            **kwargs: Additional SourceCitation attributes
        """
        self.add_source(
            url=f"internal://{identifier}",
            source_type="static",
            source_name=source_name,
            fields=fields,
            **kwargs
        )
    
    def add_cached_source(
        self,
        original_url: str,
        source_name: str,
        fields: Optional[List[str]] = None,
        **kwargs
    ) -> None:
        """
        Convenience method for cached data sources.
        
        Args:
            original_url: Original URL the cached data came from
            source_name: Name of the original source
            fields: Fields populated from cached data
            **kwargs: Additional SourceCitation attributes
        """
        self.add_source(
            url=original_url,
            source_type="cached",
            source_name=source_name,
            cache_hit=True,
            fields=fields,
            **kwargs
        )
    
    def get_sources(self) -> List[Dict[str, Any]]:
        """
        Get all sources as a list of dictionaries.
        
        Returns:
            List of source citation dictionaries
        """
        return [s.to_dict() for s in self._sources]
    
    def get_field_sources(self) -> Dict[str, List[str]]:
        """
        Get field-to-source URL mapping.
        
        Returns:
            Dictionary mapping field names to lists of source URLs
        """
        return {k: list(v) for k, v in self._field_sources.items()}
    
    def merge_from(self, other: 'SourceCollector') -> None:
        """
        Merge sources from another collector into this one.
        
        Args:
            other: Another SourceCollector to merge from
        """
        self._sources.extend(other._sources)
        for field_name, urls in other._field_sources.items():
            if field_name not in self._field_sources:
                self._field_sources[field_name] = set()
            self._field_sources[field_name].update(urls)
    
    def has_sources(self) -> bool:
        """Check if any sources have been collected."""
        return len(self._sources) > 0
    
    def source_count(self) -> int:
        """Get the number of sources collected."""
        return len(self._sources)
    
    def clear(self) -> None:
        """Clear all collected sources."""
        self._sources.clear()
        self._field_sources.clear()
    
    def __repr__(self) -> str:
        return f"SourceCollector(team='{self.team_name}', sources={len(self._sources)})"


# Standard source names for consistency across scrapers/enrichers
class SourceNames:
    """Standard source name constants for consistency."""
    
    # API Sources
    MLB_STATSAPI = "MLB StatsAPI"
    MLB_STATIC_CDN = "MLB Static CDN"
    NBA_COM = "NBA.com"
    GLEAGUE_DIRECTORY = "G League Directory"
    NFL_COM = "NFL.com"
    NHL_COM = "NHL.com"
    AHL_COM = "TheAHL.com"
    ECHL_COM = "ECHL.com"
    ESPN_API = "ESPN API"
    
    # Database Sources
    WIKIDATA_SPARQL = "WikiData SPARQL"
    DATA_COMMONS_API = "Data Commons API"
    
    # Website Sources
    TEAM_WEBSITE = "Team Official Website"
    X_PROFILE = "X Profile"
    INSTAGRAM_PROFILE = "Instagram Profile"
    FACEBOOK_PROFILE = "Facebook Profile"
    TIKTOK_PROFILE = "TikTok Profile"
    YOUTUBE_CHANNEL = "YouTube Channel"
    
    # Valuation Sources
    FORBES_VALUATIONS = "Forbes Valuations"
    SPORTICO = "Sportico"
    
    # Static Sources
    REGION_MAPPING = "Region Mapping Table"
    STATIC_TEAM_DATA = "Static Team Data"


# Source type constants
class SourceTypes:
    """Standard source type constants."""
    
    API = "api"
    WEBSITE = "website"
    DATABASE = "database"
    STATIC = "static"
    CACHED = "cached"
