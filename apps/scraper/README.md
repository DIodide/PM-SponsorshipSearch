# PlayMaker Scraper Dashboard

A full-stack application for scraping, enriching, and managing sports team data from various leagues. This is the data operations center for the PlayMaker Sponsorship Search platform.

---

## Overview

The scraper system collects and enriches data for 500+ sports teams across 10+ leagues. It provides:

- **6 League Scrapers**: Automated data collection from official sources
- **6 Data Enrichers**: Add social media, valuation, sponsor, and brand data
- **Export to Convex**: One-click sync to production database
- **Dashboard UI**: Visual management of scraping and enrichment tasks

---

## Architecture

```
apps/scraper/
├── backend/               # FastAPI Python server
│   ├── main.py           # API routes + task management
│   ├── scrapers/         # League scraper modules
│   │   ├── mlb_milb.py   # MLB + MiLB (190 teams)
│   │   ├── nba_gleague.py # NBA + G League (60 teams)
│   │   ├── nfl.py        # NFL (32 teams)
│   │   ├── nhl_ahl_echl.py # NHL + AHL + ECHL (90 teams)
│   │   ├── wnba.py       # WNBA (13 teams)
│   │   ├── mls_nwsl.py   # MLS + NWSL (43 teams)
│   │   ├── models.py     # TeamRow data model
│   │   ├── logo_utils.py # Logo fetching utilities
│   │   └── enrichers/    # Data enrichment modules
│   │       ├── base.py
│   │       ├── geo_enricher.py
│   │       ├── social_enricher.py
│   │       ├── valuation_enricher.py
│   │       ├── sponsor_enricher.py
│   │       ├── brand_enricher.py
│   │       └── website_enricher.py
│   ├── data/             # Scraped output (JSON/XLSX)
│   └── requirements.txt  # Python dependencies
│
├── frontend/             # Vite + React dashboard
│   ├── src/
│   │   ├── App.tsx      # Dashboard layout
│   │   ├── components/  # UI components
│   │   └── lib/         # API client
│   └── package.json
│
├── README.md             # This file
└── SCRAPER_ENRICHER_GUIDE.md  # Detailed technical guide
```

---

## Supported Leagues

| Scraper | Leagues | Teams | Data Source | Logos |
|---------|---------|-------|-------------|-------|
| `mlb_milb.py` | MLB, AAA, AA, A+, A, Rookie | ~190 | MLB StatsAPI | MLB CDN |
| `nba_gleague.py` | NBA, G League | ~60 | NBA.com scraping | NBA CDN |
| `nfl.py` | NFL | 32 | NFL.com scraping | ESPN API |
| `nhl_ahl_echl.py` | NHL, AHL, ECHL | ~90 | League websites | NHL CDN |
| `wnba.py` | WNBA | 13 | ESPN API | ESPN API |
| `mls_nwsl.py` | MLS, NWSL | ~43 | ESPN API | ESPN API |

---

## Data Model

### TeamRow

The core data structure for all team data:

```python
@dataclass
class TeamRow:
    # ========== Core Fields (Scrapers) ==========
    name: str                          # "Los Angeles Lakers"
    region: str                        # "Los Angeles"
    league: str                        # "NBA"
    target_demographic: str            # Generated description
    official_url: str                  # Team website
    category: str                      # "NBA", "Minor League", etc.
    logo_url: Optional[str]

    # ========== Geographic (GeoEnricher) ==========
    geo_city: Optional[str]
    geo_country: Optional[str]
    city_population: Optional[int]
    metro_gdp: Optional[float]         # Raw value in dollars

    # ========== Social Media (SocialEnricher) ==========
    social_handles: Optional[List[Dict]]  # [{platform, handle, url}]
    followers_x: Optional[int]
    followers_instagram: Optional[int]
    followers_facebook: Optional[int]
    followers_tiktok: Optional[int]
    subscribers_youtube: Optional[int]

    # ========== Family Programs (WebsiteEnricher) ==========
    family_program_count: Optional[int]
    family_program_types: Optional[List[str]]

    # ========== Stadium/Sponsors (SponsorEnricher) ==========
    owns_stadium: Optional[bool]
    stadium_name: Optional[str]
    sponsors: Optional[List[Dict]]     # [{name, category, asset_type}]

    # ========== Valuation (ValuationEnricher) ==========
    avg_ticket_price: Optional[float]
    franchise_value: Optional[float]   # Raw value in dollars
    annual_revenue: Optional[float]    # Raw value in dollars

    # ========== Brand/CSR (BrandEnricher) ==========
    mission_tags: Optional[List[str]]
    community_programs: Optional[List[str]]
    cause_partnerships: Optional[List[str]]

    # ========== Source Tracking ==========
    sources: Optional[List[Dict]]      # Data provenance
    field_sources: Optional[Dict]      # Field -> source mapping
    scraped_at: Optional[str]
    scraper_version: Optional[str]

    # ========== Metadata ==========
    enrichments_applied: Optional[List[str]]
    last_enriched: Optional[str]
```

---

## Enrichers

Each enricher adds specific data fields to team records:

### 1. Geographic Enricher (`geo_enricher.py`)

**Fields Added:** `geo_city`, `geo_country`, `city_population`, `metro_gdp`

**Data Sources:**
- Region-to-city mapping (300+ cities)
- Data Commons API for US population data

### 2. Social Media Enricher (`social_enricher.py`)

**Fields Added:** `social_handles`, `followers_x`, `followers_instagram`, `followers_facebook`, `followers_tiktok`, `subscribers_youtube`

**Data Sources:**
- WikiData SPARQL queries for handles
- Website scraping fallback
- Platform APIs / Playwright scraping for follower counts

### 3. Valuation Enricher (`valuation_enricher.py`)

**Fields Added:** `avg_ticket_price`, `franchise_value`, `annual_revenue`

**Data Sources:**
- Forbes team valuations (major leagues only)

### 4. Sponsor Enricher (`sponsor_enricher.py`)

**Fields Added:** `owns_stadium`, `stadium_name`, `sponsors`

**Data Sources:**
- WikiData for stadium ownership
- Gemini AI for sponsor extraction from team websites

### 5. Brand Enricher (`brand_enricher.py`)

**Fields Added:** `mission_tags`, `community_programs`, `cause_partnerships`

**Data Sources:**
- Team community/CSR pages
- Gemini AI for extraction and categorization

### 6. Website Enricher (`website_enricher.py`)

**Fields Added:** `family_program_count`, `family_program_types`

**Data Sources:**
- Team website scraping for family programs

---

## Quick Start

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-key
YOUTUBE_API_KEY=your-youtube-key          # Optional
DATA_COMMONS_API_KEY=your-datacommons-key # Optional
EOF

# Run the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API available at: http://localhost:8000

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Dashboard available at: http://localhost:5174

---

## API Endpoints

### Scrapers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scrapers` | List all scrapers with status |
| GET | `/api/scrapers/{id}` | Get specific scraper info |
| POST | `/api/scrapers/{id}/run` | Trigger a scraper run |
| GET | `/api/scrapers/{id}/data` | Get latest scraped data |
| GET | `/api/scrapers/{id}/download/{type}` | Download JSON or Excel |
| PUT | `/api/scrapers/{id}/team` | Update individual team field |
| POST | `/api/scrapers/{id}/clean-regions` | AI region correction |

### Enrichers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/enrichers` | List all enrichers |
| GET | `/api/enrichers/{id}` | Get enricher info |
| POST | `/api/scrapers/{id}/enrich` | Run enrichment (sync) |
| GET | `/api/scrapers/{id}/enrichment-status` | Get enrichment status |

### Async Enrichment Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/enrichment-tasks` | Create and start enrichment task |
| GET | `/api/enrichment-tasks` | List all tasks |
| GET | `/api/enrichment-tasks/{id}` | Get task status |
| GET | `/api/enrichment-tasks/{id}/diff` | Get task diff (changes made) |
| GET | `/api/enrichment-tasks/{id}/stream` | SSE stream for real-time updates |
| DELETE | `/api/enrichment-tasks/{id}` | Cancel running task |

### Convex Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/convex/status` | Check Convex connection |
| POST | `/api/convex/preview` | Preview export for one scraper |
| POST | `/api/convex/export` | Export one scraper to Convex |
| POST | `/api/convex/preview-all` | Preview export for all scrapers |
| POST | `/api/convex/export-all` | Export all scrapers to Convex |

---

## Workflow

### 1. Run Scrapers

```bash
# Via API
curl -X POST http://localhost:8000/api/scrapers/nba_gleague/run

# Or use the dashboard UI
```

### 2. Enrich Data

```bash
# Run all enrichers on NBA data
curl -X POST http://localhost:8000/api/enrichment-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "scraper_id": "nba_gleague",
    "enricher_ids": ["geo", "social", "valuation", "sponsor", "brand", "website"]
  }'
```

### 3. Export to Convex

```bash
# Export all scrapers
curl -X POST http://localhost:8000/api/convex/export-all \
  -H "Content-Type: application/json" \
  -d '{"mode": "overwrite"}'
```

---

## Output Files

Scraped data is saved to `backend/data/`:

- `{scraper}_{timestamp}.json` - JSON format
- `{scraper}_{timestamp}.xlsx` - Excel with multiple sheets

Example:
- `nba_gleague_20260121_143022.json`
- `nba_gleague_20260121_143022.xlsx`

---

## Adding a New League

See [SCRAPER_ENRICHER_GUIDE.md](./SCRAPER_ENRICHER_GUIDE.md) for detailed instructions.

### Quick Summary:

1. **Create scraper file** in `backend/scrapers/`
2. **Register in `__init__.py`**
3. **Add to `main.py`** ScraperType enum and SCRAPERS dict
4. **Update enricher mappings** (region mapping, WikiData queries, etc.)
5. **Test the scraper**

---

## Development

### Adding a New Scraper

```python
# scrapers/new_league.py
class NewLeagueScraper:
    name = "New League Teams"
    description = "Description of what this scrapes"
    source_url = "https://..."

    def __init__(self, output_dir: Path = "data"):
        self.output_dir = Path(output_dir)

    def run(self) -> ScrapeResult:
        # 1. Fetch data from source
        # 2. Parse into TeamRow objects
        # 3. Add logos
        # 4. Save to JSON/Excel
        return ScrapeResult(...)

    def get_latest_data(self) -> Optional[List[Dict]]:
        # Load most recent data file
        ...
```

### Adding a New Enricher

```python
# scrapers/enrichers/new_enricher.py
class NewEnricher(BaseEnricher):
    name = "New Enricher"
    description = "What this enricher does"
    fields_added = ["field1", "field2"]

    async def _enrich_team(self, team: TeamRow) -> bool:
        # Add data to team
        # Return True if data was added
        ...
```

---

## Related Documentation

- [Main README](../../README.md) - Project overview
- [SCRAPER_ENRICHER_GUIDE.md](./SCRAPER_ENRICHER_GUIDE.md) - Detailed technical guide
- [Convex Backend](../../packages/backend/convex/README.md) - Database schema
