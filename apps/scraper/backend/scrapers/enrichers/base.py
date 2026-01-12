"""
Base class for all team data enrichers.

Enrichers follow a pipeline pattern where each enricher:
1. Receives a list of TeamRow objects
2. Adds domain-specific data to each team
3. Returns the enriched list with metadata

Example usage:
    enricher = GeoEnricher()
    result = await enricher.enrich(teams)
    if result.success:
        enriched_teams = result.teams
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Type

from ..models import TeamRow, EnrichmentResult


@dataclass
class EnricherConfig:
    """Configuration for an enricher."""
    # Rate limiting
    max_concurrent_requests: int = 5
    request_delay_ms: int = 100
    
    # Retry settings
    max_retries: int = 3
    retry_delay_ms: int = 1000
    
    # Timeout settings
    request_timeout_s: int = 30
    
    # Batch settings
    batch_size: int = 50
    
    # API keys (enricher-specific)
    api_keys: Dict[str, str] = field(default_factory=dict)


class BaseEnricher(ABC):
    """
    Abstract base class for team data enrichers.
    
    Subclasses must implement:
    - name: Human-readable name for the enricher
    - description: What data this enricher adds
    - _enrich_team: Logic to enrich a single team
    
    Optionally override:
    - _validate_config: Check if required config/API keys are present
    - _pre_enrich: Setup before processing teams
    - _post_enrich: Cleanup after processing teams
    """
    
    # Class-level metadata (override in subclasses)
    name: str = "Base Enricher"
    description: str = "Base enricher class"
    fields_added: List[str] = []  # Fields this enricher populates
    
    def __init__(self, config: Optional[EnricherConfig] = None):
        """Initialize the enricher with optional configuration."""
        self.config = config or EnricherConfig()
        self._semaphore: Optional[asyncio.Semaphore] = None
    
    @property
    def enricher_id(self) -> str:
        """Unique identifier for this enricher (used in tracking)."""
        return self.__class__.__name__.lower().replace("enricher", "")
    
    def is_available(self) -> bool:
        """
        Check if this enricher can run (has required API keys, etc.).
        Override in subclasses that require external resources.
        """
        return True
    
    def get_info(self) -> Dict[str, Any]:
        """Get enricher metadata for API responses."""
        return {
            "id": self.enricher_id,
            "name": self.name,
            "description": self.description,
            "fields_added": self.fields_added,
            "available": self.is_available(),
        }
    
    async def enrich(self, teams: List[TeamRow]) -> EnrichmentResult:
        """
        Enrich a list of teams with additional data.
        
        Args:
            teams: List of TeamRow objects to enrich
            
        Returns:
            EnrichmentResult with success status and enriched teams
        """
        start_time = datetime.now()
        
        if not teams:
            return EnrichmentResult(
                success=True,
                enricher_name=self.name,
                teams_processed=0,
                teams_enriched=0,
                duration_ms=0,
                timestamp=start_time.isoformat(),
            )
        
        if not self.is_available():
            return EnrichmentResult(
                success=False,
                enricher_name=self.name,
                teams_processed=0,
                teams_enriched=0,
                duration_ms=0,
                timestamp=start_time.isoformat(),
                error=f"Enricher {self.name} is not available (missing configuration)",
            )
        
        try:
            # Initialize semaphore for rate limiting
            self._semaphore = asyncio.Semaphore(self.config.max_concurrent_requests)
            
            # Pre-processing hook
            await self._pre_enrich(teams)
            
            # Process teams in batches
            enriched_count = 0
            batch_size = self.config.batch_size
            
            for i in range(0, len(teams), batch_size):
                batch = teams[i:i + batch_size]
                results = await asyncio.gather(
                    *[self._enrich_team_with_retry(team) for team in batch],
                    return_exceptions=True,
                )
                
                for team, result in zip(batch, results):
                    if isinstance(result, Exception):
                        # Log but don't fail the whole batch
                        print(f"Error enriching {team.name}: {result}")
                    elif result:
                        enriched_count += 1
                        team.apply_enrichment(self.enricher_id)
                
                # Delay between batches
                if i + batch_size < len(teams):
                    await asyncio.sleep(self.config.request_delay_ms / 1000)
            
            # Post-processing hook
            await self._post_enrich(teams)
            
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            
            return EnrichmentResult(
                success=True,
                enricher_name=self.name,
                teams_processed=len(teams),
                teams_enriched=enriched_count,
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
            )
            
        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            return EnrichmentResult(
                success=False,
                enricher_name=self.name,
                teams_processed=len(teams),
                teams_enriched=0,
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
                error=str(e),
            )
    
    async def _enrich_team_with_retry(self, team: TeamRow) -> bool:
        """Enrich a single team with retry logic."""
        assert self._semaphore is not None
        
        async with self._semaphore:
            for attempt in range(self.config.max_retries):
                try:
                    return await self._enrich_team(team)
                except Exception as e:
                    if attempt == self.config.max_retries - 1:
                        raise
                    await asyncio.sleep(self.config.retry_delay_ms / 1000 * (attempt + 1))
            return False
    
    @abstractmethod
    async def _enrich_team(self, team: TeamRow) -> bool:
        """
        Enrich a single team with data from this enricher.
        
        Args:
            team: TeamRow to enrich (modified in place)
            
        Returns:
            True if any data was added, False otherwise
        """
        pass
    
    async def _pre_enrich(self, teams: List[TeamRow]) -> None:
        """
        Hook called before processing teams.
        Override to perform setup (e.g., loading lookup data).
        """
        pass
    
    async def _post_enrich(self, teams: List[TeamRow]) -> None:
        """
        Hook called after processing teams.
        Override to perform cleanup or aggregation.
        """
        pass


class EnricherRegistry:
    """
    Registry for managing available enrichers.
    
    Provides a central place to register, discover, and instantiate enrichers.
    """
    
    _enrichers: Dict[str, Type[BaseEnricher]] = {}
    
    @classmethod
    def register(cls, enricher_class: Type[BaseEnricher]) -> Type[BaseEnricher]:
        """
        Register an enricher class. Can be used as a decorator.
        
        @EnricherRegistry.register
        class MyEnricher(BaseEnricher):
            ...
        """
        enricher_id = enricher_class.__name__.lower().replace("enricher", "")
        cls._enrichers[enricher_id] = enricher_class
        return enricher_class
    
    @classmethod
    def get(cls, enricher_id: str) -> Optional[Type[BaseEnricher]]:
        """Get an enricher class by ID."""
        return cls._enrichers.get(enricher_id)
    
    @classmethod
    def list_all(cls) -> List[Dict[str, Any]]:
        """Get info for all registered enrichers."""
        result = []
        for enricher_id, enricher_class in cls._enrichers.items():
            instance = enricher_class()
            result.append(instance.get_info())
        return result
    
    @classmethod
    def get_available(cls) -> List[Type[BaseEnricher]]:
        """Get all enrichers that are currently available to run."""
        return [
            enricher_class 
            for enricher_class in cls._enrichers.values()
            if enricher_class().is_available()
        ]
    
    @classmethod
    def create(cls, enricher_id: str, config: Optional[EnricherConfig] = None) -> Optional[BaseEnricher]:
        """Create an enricher instance by ID."""
        enricher_class = cls.get(enricher_id)
        if enricher_class:
            return enricher_class(config)
        return None
