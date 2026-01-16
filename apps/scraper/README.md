# PlayMaker Scraper Dashboard

A full-stack application for scraping and managing sports team data from various sources (MLB, MiLB, NBA, G League).

## Architecture

```
apps/scraper/
├── frontend/           # Vite + React + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── hooks/      # Custom React hooks
│   │   ├── lib/        # Utilities and API client
│   │   └── types/      # TypeScript types
│   └── ...
└── backend/            # Python + FastAPI
    ├── scrapers/       # Scraper implementations
    ├── data/           # Output data files
    └── main.py         # API server
```

## Features

- **MLB & MiLB Scraper**: Fetches team data from MLB StatsAPI
- **NBA & G League Scraper**: Scrapes team data from NBA.com
- **Task Management**: Run scrapers on-demand with status tracking
- **Data Viewer**: Browse, search, and filter scraped team data
- **Export**: Download data as JSON or Excel files
- **History**: Track scrape success/failure and timing

## Quick Start

### Backend (Python)

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at http://localhost:8000

### Frontend (Vite)

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

The UI will be available at http://localhost:5174

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scrapers` | List all scrapers with status |
| GET | `/api/scrapers/{id}` | Get specific scraper info |
| POST | `/api/scrapers/{id}/run` | Trigger a scraper run |
| GET | `/api/scrapers/{id}/data` | Get latest scraped data |
| GET | `/api/scrapers/{id}/download/{type}` | Download JSON or Excel file |
| GET | `/api/files` | List all generated data files |
| GET | `/health` | Health check |

## Scrapers

### MLB & MiLB (`mlb_milb`)
- Source: MLB StatsAPI
- Data: Team names, regions, leagues, official URLs
- Categories: MLB (30 teams), MiLB (120+ teams)

### NBA & G League (`nba_gleague`)
- Source: NBA.com and gleague.nba.com
- Data: Team names, regions, leagues, official URLs
- Categories: NBA (30 teams), G League (30+ teams)
- Includes fallback to static data if live scraping fails

## Output Files

Scraped data is saved to `backend/data/` as:
- `{scraper}_{timestamp}.json` - JSON format
- `{scraper}_{timestamp}.xlsx` - Excel with multiple sheets

## Development

### Adding a New Scraper

1. Create a new file in `backend/scrapers/`
2. Implement the scraper class with `run()` and `get_latest_data()` methods
3. Register in `backend/scrapers/__init__.py`
4. Add to `SCRAPERS` and `SCRAPER_INFO` in `backend/main.py`

### Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Hugeicons

**Backend:**
- Python 3.11+
- FastAPI
- BeautifulSoup4
- Pandas
- Requests


# Setup

Create profile on https://apikeys.datacommons.org/
