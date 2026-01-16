# Scraper & Enricher Architecture Guide

This document explains how the sponsorship search scrapers and enrichers work, and how to extend them for new leagues like WNBA.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Data Model](#core-data-model)
3. [Scrapers](#scrapers)
   - [MLB/MiLB Scraper](#mlbmilb-scraper)
   - [NBA/G-League Scraper](#nbag-league-scraper)
   - [NFL Scraper](#nfl-scraper)
   - [NHL/AHL/ECHL Scraper](#nhlahlechl-scraper)
4. [Enrichers](#enrichers)
   - [Base Enricher](#base-enricher)
   - [Geographic Enricher](#geographic-enricher)
   - [Social Media Enricher](#social-media-enricher)
   - [Website Enricher](#website-enricher)
   - [Sponsor Enricher](#sponsor-enricher)
   - [Valuation Enricher](#valuation-enricher)
   - [Brand Enricher](#brand-enricher)
5. [Extending for WNBA/New Leagues](#extending-for-wnbanew-leagues)

---

## Architecture Overview

The system follows a **two-phase architecture**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA PIPELINE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PHASE 1: SCRAPERS                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │ MLB/MiLB    │    │ NBA/G-Lg    │    │ NFL         │             │
│  │ Scraper     │    │ Scraper     │    │ Scraper     │   ...       │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘             │
│         │                  │                  │                     │
│         └─────────────────┼──────────────────┘                     │
│                           ▼                                         │
│                    ┌─────────────┐                                  │
│                    │  TeamRow[]  │  (Core fields only)              │
│                    └──────┬──────┘                                  │
│                           │                                         │
│  PHASE 2: ENRICHERS      │                                         │
│                           ▼                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │  Geo    │→ │ Social  │→ │ Website │→ │ Sponsor │→ │  Brand  │  │
│  │Enricher │  │Enricher │  │Enricher │  │Enricher │  │Enricher │  │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │
│                           │                                         │
│                           ▼                                         │
│                    ┌─────────────┐                                  │
│                    │  TeamRow[]  │  (All fields populated)          │
│                    └─────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Separation of Concerns**: Scrapers collect basic team data; enrichers add domain-specific data
2. **Idempotent Operations**: Enrichers check if data exists before adding; re-running is safe
3. **Fallback Strategies**: Each scraper/enricher has primary and fallback data sources
4. **Rate Limiting**: Built-in delays and semaphores prevent API abuse
5. **Progress Tracking**: Real-time progress callbacks for UI feedback

---

## Core Data Model

### TeamRow (`models.py`)

The central data structure that stores all team information:

```python
@dataclass
class TeamRow:
    # ========== Core Fields (Scrapers) ==========
    name: str                          # "Los Angeles Lakers"
    region: str                        # "Los Angeles"
    league: str                        # "NBA"
    target_demographic: str            # "Basketball fans in Los Angeles..."
    official_url: str                  # "https://www.nba.com/lakers/"
    category: str                      # "NBA" / "G League" / "Major" / "Minor"
    logo_url: Optional[str]            # Logo CDN URL

    # ========== Geographic (GeoEnricher) ==========
    geo_city: Optional[str]            # "Los Angeles"
    geo_country: Optional[str]         # "US"
    city_population: Optional[int]     # 3898747
    metro_gdp_millions: Optional[float]# (future)

    # ========== Social/Audience (SocialEnricher) ==========
    social_handles: Optional[List[Dict]]  # [{platform, handle, url, unique_id}]
    followers_x: Optional[int]
    followers_instagram: Optional[int]
    followers_facebook: Optional[int]
    followers_tiktok: Optional[int]
    subscribers_youtube: Optional[int]

    # ========== Family Friendliness (WebsiteEnricher) ==========
    family_program_count: Optional[int]
    family_program_types: Optional[List[str]]  # ["Kids Club", "Summer Camp"]

    # ========== Inventory/Sponsors (SponsorEnricher) ==========
    owns_stadium: Optional[bool]
    stadium_name: Optional[str]
    sponsors: Optional[List[Dict]]     # [{name, category, asset_type}]

    # ========== Pricing/Valuation (ValuationEnricher) ==========
    avg_ticket_price: Optional[float]
    franchise_value_millions: Optional[float]
    annual_revenue_millions: Optional[float]

    # ========== Brand Alignment (BrandEnricher) ==========
    mission_tags: Optional[List[str]]        # ["Youth Development", "Diversity & Inclusion"]
    community_programs: Optional[List[str]]  # ["Lakers Youth Foundation"]
    cause_partnerships: Optional[List[str]]  # ["Boys & Girls Club"]

    # ========== Metadata ==========
    enrichments_applied: Optional[List[str]] # ["geo", "social", "website"]
    last_enriched: Optional[str]             # ISO timestamp
```

---

## Scrapers

### Common Scraper Pattern

All scrapers follow this pattern:

```python
class MyScraper:
    name = "My Scraper"
    description = "What this scraper does"
    source_url = "https://..."

    def __init__(self, output_dir: Path = "data"):
        self.output_dir = Path(output_dir)

    def run(self) -> ScrapeResult:
        """Main entry point - fetches and saves data"""
        # 1. Try live scraping
        # 2. Fall back to static data if needed
        # 3. Enrich with logos
        # 4. Save to JSON + Excel
        return ScrapeResult(...)

    def get_latest_data(self) -> Optional[List[Dict]]:
        """Load most recent scraped data"""
```

---

### MLB/MiLB Scraper

**File:** `scrapers/mlb_milb.py`

**Data Source:** MLB StatsAPI (`https://statsapi.mlb.com/api/v1/teams`)

**How it works:**

1. **Fetch Teams**: Queries MLB StatsAPI for multiple sport IDs:
   - `sportId=1`: MLB (30 teams)
   - `sportId=11`: Triple-A
   - `sportId=12`: Double-A
   - `sportId=13`: High-A
   - `sportId=14`: Single-A
   - `sportId=16`: Rookie

2. **Filter Active Teams**: Only includes teams where `active=true`

3. **Generate URLs**:
   - **MLB teams**: Uses `MLB_TEAM_SLUGS` mapping (e.g., `108 → "angels"` → `https://www.mlb.com/angels`)
   - **MiLB teams**: Derives from location name (e.g., "Round Rock" → `https://www.milb.com/round-rock`)

4. **Logos**: Uses MLB Static CDN (`https://www.mlb.com/team_logos/team_cap_on_light/...`)

**Output:** `mlb_milb_teams_{timestamp}.json` with ~190 teams

---

### NBA/G-League Scraper

**File:** `scrapers/nba_gleague.py`

**Data Source:** Web scraping from `nba.com/teams` and `gleague.nba.com/teams`

**How it works:**

1. **NBA Teams**:
   - Scrapes `https://www.nba.com/teams` page
   - Finds all `<a>` tags with team slugs (e.g., `/lakers/`)
   - Falls back to `NBA_TEAMS_STATIC` (30 hardcoded teams) if scraping fails

2. **G-League Teams**:
   - Scrapes `https://gleague.nba.com/teams`
   - Finds subdomain links (e.g., `https://austin.gleague.nba.com/`)
   - Removes NBA affiliate suffix from names
   - Falls back to `GLEAGUE_TEAMS_STATIC` (32 teams)

3. **Logos**:
   - NBA: Uses NBA CDN with team IDs from `NBA_TEAM_IDS` mapping
   - G-League: Scrapes logo URLs from team directory pages

**Output:** `nba_gleague_teams_{timestamp}.json` with ~62 teams

---

### NFL Scraper

**File:** `scrapers/nfl.py`

**Data Source:** Web scraping from `nfl.com/teams/`

**How it works:**

1. **Live Scraping**:
   - Finds all "View Full Site" links on the NFL teams page
   - Extracts team names from nearby HTML elements
   - Builds official team URLs (e.g., `https://www.dallascowboys.com/`)

2. **Fallback**: `NFL_TEAMS_STATIC` with all 32 teams hardcoded

3. **Logos**: ESPN API (`site.api.espn.com/apis/site/v2/sports/football/nfl/teams`)

**Output:** `nfl_teams_{timestamp}.json` with 32 teams

---

### NHL/AHL/ECHL Scraper

**File:** `scrapers/nhl_ahl_echl.py`

**Data Source:** Web scraping from three league websites

**How it works:**

1. **NHL** (`nhl.com/info/teams/`):
   - Finds links matching `https://www.nhl.com/{team-slug}`
   - Falls back to `NHL_TEAMS_STATIC` (32+ teams)

2. **AHL** (`theahl.com/team-map-directory`):
   - Parses team entries with "NHL Affiliation:" markers
   - Extracts team website from non-social links
   - Falls back to `AHL_TEAMS_STATIC` (~32 teams)

3. **ECHL** (`echl.com/teams`):
   - Finds profile links matching `echl.com/teams/{team}`
   - Separates team sites from ECHL profile URLs
   - Falls back to `ECHL_TEAMS_STATIC` (~28 teams)

4. **Logos**:
   - NHL: NHL Assets CDN with abbreviation mapping
   - AHL/ECHL: Scraped from respective league directories

**Output:** `nhl_ahl_echl_teams_{timestamp}.json` with ~90 teams

---

## Enrichers

### Base Enricher (`enrichers/base.py`)

All enrichers inherit from `BaseEnricher`:

```python
class BaseEnricher(ABC):
    name = "Base Enricher"
    description = "Description"
    fields_added = ["field1", "field2"]

    async def enrich(self, teams: List[TeamRow], progress_callback=None) -> EnrichmentResult:
        """Main entry - processes all teams"""
        # 1. _pre_enrich() - setup
        # 2. For each batch: _enrich_team() with retry logic
        # 3. _post_enrich() - cleanup
        # 4. Return EnrichmentResult

    @abstractmethod
    async def _enrich_team(self, team: TeamRow) -> bool:
        """Override this - returns True if data was added"""
        pass

    async def _pre_enrich(self, teams: List[TeamRow]) -> None:
        """Override for setup (init clients, pre-fetch data)"""
        pass

    async def _post_enrich(self, teams: List[TeamRow]) -> None:
        """Override for cleanup"""
        pass
```

**Key Features:**
- **Rate Limiting**: Configurable `max_concurrent_requests` and `request_delay_ms`
- **Retry Logic**: Automatic retries with exponential backoff
- **Progress Callbacks**: Real-time updates for UI
- **Batch Processing**: Processes teams in configurable batch sizes

---

### Geographic Enricher

**File:** `enrichers/geo_enricher.py`

**Fields Added:** `geo_city`, `geo_country`, `city_population`, `metro_gdp_millions`

**How it works:**

1. **Region Resolution**: Maps team `region` to structured data using `REGION_MAPPING`:
   ```python
   REGION_MAPPING = {
       "Los Angeles": ("Los Angeles", "US", "geoId/0644000"),
       "Toronto": ("Toronto", "CA", None),  # No US Census for Canada
       ...
   }
   ```
   - Handles ~300+ city/region mappings
   - Includes multi-word regions, Canadian cities, Dominican Republic, Mexico

2. **Population Lookup**: Uses Data Commons API (`api.datacommons.org/stat/value`):
   ```
   GET /stat/value?place=geoId/0644000&stat_var=Count_Person
   ```

3. **Non-US Handling**: Canadian/International teams get city/country but no population (US Census only)

**Example Result:**
```json
{
  "geo_city": "Los Angeles",
  "geo_country": "US",
  "city_population": 3898747
}
```

---

### Social Media Enricher

**File:** `enrichers/social_enricher.py`

**Fields Added:** `social_handles`, `followers_x`, `followers_instagram`, `followers_facebook`, `followers_tiktok`, `subscribers_youtube`

**How it works (3-stage process):**

#### Stage 1: Handle Discovery

**Primary: WikiData SPARQL**
```sparql
SELECT ?team ?twitter ?instagram ?facebook ?tiktok ?youtube WHERE {
  ?team wdt:P31 wd:Q13393265 .  # basketball team
  ?team wdt:P17 wd:Q30 .        # USA-based
  OPTIONAL { ?team wdt:P2002 ?twitter . }    # X/Twitter
  OPTIONAL { ?team wdt:P2003 ?instagram . }  # Instagram
  OPTIONAL { ?team wdt:P2013 ?facebook . }   # Facebook
  OPTIONAL { ?team wdt:P7085 ?tiktok . }     # TikTok
  OPTIONAL { ?team wdt:P2397 ?youtube . }    # YouTube Channel ID
}
```

**Fallback: Website Scraping**
- Fetches team's `official_url`
- Regex extracts social links from HTML

#### Stage 2: Store Structured Handles

```json
{
  "social_handles": [
    {
      "platform": "youtube",
      "handle": "UChs6P6fWYUE_2nNHWNVrpvw",
      "url": "https://www.youtube.com/channel/UChs6P6fWYUE_2nNHWNVrpvw",
      "unique_id": "UChs6P6fWYUE_2nNHWNVrpvw"
    },
    {
      "platform": "x",
      "handle": "Lakers",
      "url": "https://x.com/Lakers"
    }
  ]
}
```

#### Stage 3: Follower Count Scraping

**With API Key (YouTube):**
```
GET /youtube/v3/channels?part=statistics&id={channelId}&key={apiKey}
```

**Without API Keys (Playwright):**
- Launches headless Chromium browser
- Navigates to profile URL
- Extracts follower counts using CSS selectors
- Handles dynamic content (waits, scrolls)

**Platform-specific selectors:**
```python
FOLLOWER_SELECTORS = {
    "x": ['a[href$="/followers"] span', ...],
    "instagram": ['meta[property="og:description"]', ...],
    "youtube": ['#subscriber-count', ...],
    ...
}
```

---

### Website Enricher

**File:** `enrichers/website_enricher.py`

**Fields Added:** `family_program_count`, `family_program_types`

**How it works:**

1. **URL Discovery**: Checks common family-related paths:
   ```python
   FAMILY_URL_PATTERNS = [
       "/kids", "/kids-club", "/family", "/youth",
       "/camps", "/summer-camps", "/birthday", ...
   ]
   ```

2. **Content Extraction**: For each page:
   - Removes script/style/nav elements
   - Extracts text content
   - Includes image alt text

3. **Pattern Matching**: Searches for program keywords:
   ```python
   FAMILY_KEYWORD_PATTERNS = {
       "Kids Club": [r"kids?\s*club", r"junior\s*fan\s*club", ...],
       "Family Pack": [r"family\s*pack(?:age)?s?", ...],
       "Summer Camp": [r"summer\s*camp", r"sports?\s*camp", ...],
       ...
   }
   ```

**Example Result:**
```json
{
  "family_program_count": 5,
  "family_program_types": ["Kids Club", "Family Pack", "Summer Camp", "Birthday Party", "Youth Academy"]
}
```

---

### Sponsor Enricher

**File:** `enrichers/sponsor_enricher.py`

**Fields Added:** `owns_stadium`, `stadium_name`, `sponsors`

**How it works:**

#### Stadium Data (WikiData)

1. **Batch Query by Sport**:
   ```sparql
   SELECT ?team ?teamLabel ?venue ?venueLabel ?venueOwnerLabel WHERE {
     ?team wdt:P31 wd:Q17156793 .  # American football team
     OPTIONAL { ?team wdt:P115 ?venue . }
     OPTIONAL { ?venue wdt:P127 ?venueOwner . }
   }
   ```

2. **Ownership Detection**: Compares team name with venue owner
   - "SoFi Stadium" owned by "Rams/Chargers" → `owns_stadium: true`
   - "Lambeau Field" owned by "Green Bay Packers" → `owns_stadium: true`

#### Sponsor Data (Gemini AI)

1. **Find Sponsor Page**: Checks common paths (`/partners`, `/sponsors`, `/corporate-partners`)

2. **Scrape Content**: Extracts text and image alt text

3. **Gemini Extraction**: Prompts Gemini to extract structured sponsor data:
   ```json
   [
     {"name": "Nike", "category": "Apparel", "asset_type": "Official Outfitter"},
     {"name": "Coca-Cola", "category": "Beverage", "asset_type": "Official Partner"}
   ]
   ```

---

### Valuation Enricher

**File:** `enrichers/valuation_enricher.py`

**Fields Added:** `avg_ticket_price`, `franchise_value_millions`, `annual_revenue_millions`

**How it works:**

1. **Filter**: Only processes major league teams (NFL, NBA, MLB, NHL, MLS)

2. **Forbes Scraping**: Fetches `forbes.com/teams/{team-slug}/`

3. **Data Extraction** (regex parsing):
   ```python
   # Team Value: "$11B Calculated October 2025" → 11000.0
   value_match = re.search(r"\$(\d+(?:\.\d+)?)\s*([BMK])\s*[Cc]alculated", text)
   
   # Revenue: "Revenue $880M" → 880.0
   revenue_match = re.search(r"Revenue.*?\$(\d+(?:\.\d+)?)\s*([BMK])", text)
   
   # Avg Ticket: "Average Ticket Price $285" → 285.0
   ticket_match = re.search(r"Average\s+Ticket\s+Price\s*\$(\d+(?:\.\d+)?)", text)
   ```

**Example Result:**
```json
{
  "franchise_value_millions": 11000.0,
  "annual_revenue_millions": 880.0,
  "avg_ticket_price": 285.0
}
```

---

### Brand Enricher

**File:** `enrichers/brand_enricher.py`

**Fields Added:** `mission_tags`, `community_programs`, `cause_partnerships`

**Requires:** Gemini API key (`GOOGLE_GENERATIVE_AI_API_KEY`)

**How it works:**

1. **Content Discovery**: Fetches community/CSR pages:
   ```python
   COMMUNITY_URL_PATTERNS = [
       "/community", "/foundation", "/charity",
       "/sustainability", "/diversity", "/causes", ...
   ]
   ```

2. **Relevance Filtering**: Only processes pages with CSR keywords

3. **Gemini Extraction**: Prompts Gemini with standardized tags:
   ```python
   STANDARDIZED_TAGS = [
       "Youth Development", "Health & Wellness", "Diversity & Inclusion",
       "Environmental Sustainability", "Veterans & Military", "Hunger Relief",
       "Education", "Community Development", "First Responders", ...
   ]
   ```

**Example Result:**
```json
{
  "mission_tags": ["Youth Development", "Community Development", "Diversity & Inclusion"],
  "community_programs": ["Lakers Youth Foundation", "Lakers Reading Time"],
  "cause_partnerships": ["After-School All-Stars", "Make-A-Wish Foundation"]
}
```

---

## Extending for WNBA/New Leagues

Adding support for WNBA or other leagues requires two main steps:

### Step 1: Create a New Scraper

Create `scrapers/wnba.py`:

```python
"""
WNBA Teams Scraper
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import requests
from bs4 import BeautifulSoup

from .logo_utils import fetch_espn_logos, _norm_name


WNBA_TEAMS_URL = "https://www.wnba.com/teams"

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Static fallback data (12 WNBA teams as of 2026)
WNBA_TEAMS_STATIC = [
    ("Atlanta Dream", "Atlanta", "https://dream.wnba.com/"),
    ("Chicago Sky", "Chicago", "https://sky.wnba.com/"),
    ("Connecticut Sun", "Uncasville", "https://sun.wnba.com/"),
    ("Dallas Wings", "Dallas", "https://wings.wnba.com/"),
    ("Golden State Valkyries", "San Francisco", "https://valkyries.wnba.com/"),
    ("Indiana Fever", "Indianapolis", "https://fever.wnba.com/"),
    ("Las Vegas Aces", "Las Vegas", "https://aces.wnba.com/"),
    ("Los Angeles Sparks", "Los Angeles", "https://sparks.wnba.com/"),
    ("Minnesota Lynx", "Minneapolis", "https://lynx.wnba.com/"),
    ("New York Liberty", "New York", "https://liberty.wnba.com/"),
    ("Phoenix Mercury", "Phoenix", "https://mercury.wnba.com/"),
    ("Seattle Storm", "Seattle", "https://storm.wnba.com/"),
    ("Washington Mystics", "Washington", "https://mystics.wnba.com/"),
]


@dataclass
class TeamRow:
    name: str
    region: str
    league: str
    target_demographic: str
    official_url: str
    category: str
    logo_url: Optional[str] = None


@dataclass
class ScrapeResult:
    success: bool
    teams_count: int
    wnba_count: int
    duration_ms: int
    timestamp: str
    json_path: Optional[str] = None
    xlsx_path: Optional[str] = None
    error: Optional[str] = None
    used_fallback: bool = False


class WNBAScraper:
    """Scraper for WNBA teams."""

    name = "WNBA Teams"
    description = "Scrapes team data from WNBA.com official directory."
    source_url = "https://www.wnba.com/teams"

    def __init__(self, output_dir: Path | str = "data"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)

    def _get_soup(self, url: str, timeout_s: int = 30) -> BeautifulSoup:
        """Fetch and parse HTML from URL."""
        response = self.session.get(url, timeout=timeout_s)
        response.raise_for_status()
        return BeautifulSoup(response.text, "html.parser")

    def _infer_region(self, team_name: str) -> str:
        """Extract region from team name."""
        multiword_regions = [
            "New York", "Los Angeles", "Las Vegas", "Golden State"
        ]
        for r in multiword_regions:
            if team_name.startswith(r + " "):
                return r
        return team_name.split()[0] if team_name else ""

    def _get_wnba_teams_static(self) -> List[TeamRow]:
        """Get WNBA teams from static data."""
        return [
            TeamRow(
                name=name,
                region=region,
                league="WNBA",
                target_demographic=f"Women's basketball fans in and around {region}, plus the broader WNBA audience.",
                official_url=url,
                category="WNBA",
            )
            for name, region, url in WNBA_TEAMS_STATIC
        ]

    def _parse_wnba_teams_live(self, soup: BeautifulSoup) -> List[TeamRow]:
        """Parse WNBA teams from live HTML."""
        # TODO: Implement live scraping based on WNBA.com structure
        # For now, return static data
        return self._get_wnba_teams_static()

    def _write_outputs(self, rows: List[TeamRow], json_path: Path, xlsx_path: Path) -> None:
        """Write team data to JSON and Excel files."""
        df = pd.DataFrame([asdict(r) for r in rows])
        df_sorted = df.sort_values(["region", "name"]).reset_index(drop=True)

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(df_sorted.to_dict(orient="records"), f, ensure_ascii=False, indent=2)

        with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
            df_sorted.to_excel(writer, index=False, sheet_name="WNBA Teams")

    def _enrich_with_logos(self, rows: List[TeamRow]) -> None:
        """Add logo URLs to team rows."""
        espn_logos = fetch_espn_logos("wnba")
        for row in rows:
            norm = _norm_name(row.name)
            if norm in espn_logos:
                row.logo_url = espn_logos[norm]

    def run(self) -> ScrapeResult:
        """Execute the scrape and return results."""
        start_time = datetime.now()
        used_fallback = False

        try:
            try:
                soup = self._get_soup(WNBA_TEAMS_URL)
                rows = self._parse_wnba_teams_live(soup)
                if len(rows) < 10:
                    rows = self._get_wnba_teams_static()
                    used_fallback = True
            except Exception:
                rows = self._get_wnba_teams_static()
                used_fallback = True

            self._enrich_with_logos(rows)

            timestamp = start_time.strftime("%Y%m%d_%H%M%S")
            json_path = self.output_dir / f"wnba_teams_{timestamp}.json"
            xlsx_path = self.output_dir / f"wnba_teams_{timestamp}.xlsx"

            self._write_outputs(rows, json_path, xlsx_path)

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            return ScrapeResult(
                success=True,
                teams_count=len(rows),
                wnba_count=len(rows),
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
                json_path=str(json_path),
                xlsx_path=str(xlsx_path),
                used_fallback=used_fallback,
            )

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            return ScrapeResult(
                success=False,
                teams_count=0,
                wnba_count=0,
                duration_ms=duration_ms,
                timestamp=start_time.isoformat(),
                error=str(e),
                used_fallback=used_fallback,
            )

    def get_latest_data(self) -> Optional[List[Dict[str, Any]]]:
        """Get the most recent scraped data."""
        json_files = sorted(self.output_dir.glob("wnba_teams_*.json"), reverse=True)
        if not json_files:
            return None
        with open(json_files[0], "r", encoding="utf-8") as f:
            return json.load(f)
```

### Step 2: Register in `__init__.py`

Add to `scrapers/__init__.py`:

```python
from .wnba import WNBAScraper

__all__ = [
    # ... existing exports
    "WNBAScraper",
]
```

### Step 3: Add to `main.py`

Add to `ScraperType` enum:

```python
class ScraperType(str, Enum):
    MLB_MILB = "mlb_milb"
    NBA_GLEAGUE = "nba_gleague"
    NFL = "nfl"
    NHL_AHL_ECHL = "nhl_ahl_echl"
    WNBA = "wnba"  # NEW
```

Add to scraper instantiation:

```python
from scrapers import MLBMiLBScraper, NBAGLeagueScraper, NFLScraper, NHLAHLECHLScraper, WNBAScraper

# In initialization...
ScraperType.WNBA: WNBAScraper(output_dir=DATA_DIR),
```

### Step 4: Update Enricher Mappings

#### GeoEnricher (`geo_enricher.py`)

Add any new regions to `REGION_MAPPING`:

```python
REGION_MAPPING = {
    # ... existing mappings
    "Uncasville": ("Uncasville", "US", "geoId/0977810"),  # Connecticut Sun
}
```

#### SocialEnricher (`social_enricher.py`)

The enricher already handles basketball via WikiData `Q13393265` (basketball team), but WNBA teams are actually `Q570116` (women's basketball team). Update:

```python
SPORT_TEAM_CLASSES = {
    "baseball": "Q13027888",
    "basketball": "Q13393265",
    "womens_basketball": "Q570116",  # NEW
    "football": "Q17156793",
    "hockey": "Q4498974",
}

LEAGUE_TO_SPORT = {
    # ... existing
    "wnba": "womens_basketball",  # NEW
    "women's national basketball association": "womens_basketball",  # NEW
}
```

#### SponsorEnricher (`sponsor_enricher.py`)

Similar updates needed:

```python
SPORT_CONFIG = {
    # ... existing
    "womens_basketball": {
        "team_class": "Q570116",
        "keywords": ["wnba", "women's basketball"],
    },
}

LEAGUE_TO_SPORT = {
    # ... existing
    "wnba": "womens_basketball",
}
```

#### ValuationEnricher (`valuation_enricher.py`)

Add WNBA to Forbes-tracked leagues (if Forbes covers them):

```python
FORBES_TRACKED_LEAGUES = {
    # ... existing
    "wnba",
    "women's national basketball association",
}
```

### Summary of Changes for New League

| File | Change |
|------|--------|
| `scrapers/wnba.py` | New scraper file |
| `scrapers/__init__.py` | Export `WNBAScraper` |
| `main.py` | Add `ScraperType.WNBA`, instantiate scraper |
| `enrichers/geo_enricher.py` | Add region mappings if needed |
| `enrichers/social_enricher.py` | Add WikiData class and league mapping |
| `enrichers/sponsor_enricher.py` | Add sport config and league mapping |
| `enrichers/valuation_enricher.py` | Add to Forbes leagues if applicable |

---

## Testing New Scrapers

```bash
# Run the WNBA scraper directly
cd apps/scraper/backend
python -c "from scrapers.wnba import WNBAScraper; print(WNBAScraper().run())"

# Run enrichers on the data
python -c "
import asyncio
from scrapers.wnba import WNBAScraper
from scrapers.models import TeamRow
from scrapers.enrichers.geo_enricher import GeoEnricher

scraper = WNBAScraper()
result = scraper.run()
data = scraper.get_latest_data()
teams = [TeamRow.from_dict(t) for t in data]

async def test():
    enricher = GeoEnricher()
    result = await enricher.enrich(teams)
    print(result)
    print(teams[0].geo_city, teams[0].city_population)

asyncio.run(test())
"
```

---

## Common Extension Patterns

### Adding a Minor League

For minor leagues affiliated with existing majors (e.g., WNBA developmental league):

1. Add to existing scraper as additional category
2. Modify `category` field to distinguish (e.g., "WNBA" vs "WNBA Dev")
3. Update static fallback data

### Adding an International League

1. Create new scraper with appropriate data source
2. Add country-specific regions to `GeoEnricher.REGION_MAPPING`
3. Consider separate WikiData queries for international teams
4. Forbes valuation may not apply

### Adding a Completely New Sport

1. Create new scraper
2. Add new sport type to all enrichers:
   - `SPORT_TEAM_CLASSES` in social/sponsor enrichers
   - `LEAGUE_TO_SPORT` mappings
   - Forbes tracking (if applicable)
3. Consider sport-specific family program keywords in `WebsiteEnricher`
