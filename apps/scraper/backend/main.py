"""
Scraper API Server
FastAPI backend for managing and running scrape tasks.
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict, field
from enum import Enum

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from scrapers import MLBMiLBScraper, NBAGLeagueScraper, NFLScraper, NHLAHLECHLScraper


# Configuration
DATA_DIR = Path(__file__).parent / "data"
STATE_FILE = DATA_DIR / "scraper_state.json"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class ScraperType(str, Enum):
    MLB_MILB = "mlb_milb"
    NBA_GLEAGUE = "nba_gleague"
    NFL = "nfl"
    NHL_AHL_ECHL = "nhl_ahl_echl"


class TaskStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


@dataclass
class ScraperState:
    status: TaskStatus = TaskStatus.IDLE
    last_run: Optional[str] = None
    last_success: Optional[str] = None
    last_error: Optional[str] = None
    last_duration_ms: int = 0
    total_runs: int = 0
    successful_runs: int = 0
    last_teams_count: int = 0
    last_json_path: Optional[str] = None
    last_xlsx_path: Optional[str] = None


@dataclass
class AppState:
    scrapers: Dict[str, ScraperState] = field(default_factory=dict)

    def __post_init__(self):
        # Initialize all scraper states
        for scraper_type in ScraperType:
            if scraper_type.value not in self.scrapers:
                self.scrapers[scraper_type.value] = ScraperState()


# Initialize FastAPI
app = FastAPI(
    title="PlayMaker Scraper API",
    description="API for managing sports team data scraping tasks",
    version="1.0.0",
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
app_state: AppState = AppState()


def load_state() -> AppState:
    """Load persisted state from file."""
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE, "r") as f:
                data = json.load(f)
                scrapers = {}
                for key, val in data.get("scrapers", {}).items():
                    scrapers[key] = ScraperState(
                        status=TaskStatus(val.get("status", "idle")),
                        last_run=val.get("last_run"),
                        last_success=val.get("last_success"),
                        last_error=val.get("last_error"),
                        last_duration_ms=val.get("last_duration_ms", 0),
                        total_runs=val.get("total_runs", 0),
                        successful_runs=val.get("successful_runs", 0),
                        last_teams_count=val.get("last_teams_count", 0),
                        last_json_path=val.get("last_json_path"),
                        last_xlsx_path=val.get("last_xlsx_path"),
                    )
                return AppState(scrapers=scrapers)
        except Exception:
            pass
    return AppState()


def save_state():
    """Persist state to file."""
    data = {"scrapers": {key: asdict(val) for key, val in app_state.scrapers.items()}}
    with open(STATE_FILE, "w") as f:
        json.dump(data, f, indent=2)


@app.on_event("startup")
async def startup():
    global app_state
    app_state = load_state()


# Pydantic models for API
class ScraperInfo(BaseModel):
    id: str
    name: str
    description: str
    source_url: str
    status: str
    last_run: Optional[str]
    last_success: Optional[str]
    last_error: Optional[str]
    last_duration_ms: int
    total_runs: int
    successful_runs: int
    last_teams_count: int


class RunTaskRequest(BaseModel):
    scraper_id: str


class RunTaskResponse(BaseModel):
    success: bool
    message: str


class DataResponse(BaseModel):
    scraper_id: str
    teams: List[Dict[str, Any]]
    count: int
    last_updated: Optional[str]


# Scraper instances
SCRAPERS = {
    ScraperType.MLB_MILB.value: MLBMiLBScraper(output_dir=DATA_DIR),
    ScraperType.NBA_GLEAGUE.value: NBAGLeagueScraper(output_dir=DATA_DIR),
    ScraperType.NFL.value: NFLScraper(output_dir=DATA_DIR),
    ScraperType.NHL_AHL_ECHL.value: NHLAHLECHLScraper(output_dir=DATA_DIR),
}

SCRAPER_INFO = {
    ScraperType.MLB_MILB.value: {
        "name": "MLB & MiLB Teams",
        "description": "Fetches team data from MLB StatsAPI including MLB and all affiliated minor league teams.",
        "source_url": "https://statsapi.mlb.com/api/v1/teams",
    },
    ScraperType.NBA_GLEAGUE.value: {
        "name": "NBA & G League Teams",
        "description": "Scrapes team data from NBA.com and G League official directories.",
        "source_url": "https://www.nba.com/teams",
    },
    ScraperType.NFL.value: {
        "name": "NFL Teams",
        "description": "Scrapes team data from NFL.com official directory (32 NFL teams).",
        "source_url": "https://www.nfl.com/teams/",
    },
    ScraperType.NHL_AHL_ECHL.value: {
        "name": "NHL, AHL & ECHL Teams",
        "description": "Scrapes team data from NHL.com, TheAHL.com, and ECHL.com official directories.",
        "source_url": "https://www.nhl.com/info/teams/",
    },
}


def run_scraper_sync(scraper_id: str):
    """Run a scraper synchronously (called in background)."""
    global app_state

    scraper = SCRAPERS.get(scraper_id)
    if not scraper:
        return

    state = app_state.scrapers.get(scraper_id, ScraperState())
    state.status = TaskStatus.RUNNING
    state.last_run = datetime.now().isoformat()
    state.total_runs += 1
    save_state()

    try:
        result = scraper.run()

        if result.success:
            state.status = TaskStatus.SUCCESS
            state.last_success = result.timestamp
            state.last_error = None
            state.successful_runs += 1
            state.last_teams_count = result.teams_count
            state.last_json_path = result.json_path
            state.last_xlsx_path = result.xlsx_path
        else:
            state.status = TaskStatus.FAILED
            state.last_error = result.error

        state.last_duration_ms = result.duration_ms

    except Exception as e:
        state.status = TaskStatus.FAILED
        state.last_error = str(e)

    app_state.scrapers[scraper_id] = state
    save_state()


@app.get("/api/scrapers", response_model=List[ScraperInfo])
async def list_scrapers():
    """List all available scrapers with their current status."""
    result = []
    for scraper_id, info in SCRAPER_INFO.items():
        state = app_state.scrapers.get(scraper_id, ScraperState())
        result.append(
            ScraperInfo(
                id=scraper_id,
                name=info["name"],
                description=info["description"],
                source_url=info["source_url"],
                status=state.status.value,
                last_run=state.last_run,
                last_success=state.last_success,
                last_error=state.last_error,
                last_duration_ms=state.last_duration_ms,
                total_runs=state.total_runs,
                successful_runs=state.successful_runs,
                last_teams_count=state.last_teams_count,
            )
        )
    return result


@app.get("/api/scrapers/{scraper_id}", response_model=ScraperInfo)
async def get_scraper(scraper_id: str):
    """Get status of a specific scraper."""
    if scraper_id not in SCRAPER_INFO:
        raise HTTPException(status_code=404, detail="Scraper not found")

    info = SCRAPER_INFO[scraper_id]
    state = app_state.scrapers.get(scraper_id, ScraperState())

    return ScraperInfo(
        id=scraper_id,
        name=info["name"],
        description=info["description"],
        source_url=info["source_url"],
        status=state.status.value,
        last_run=state.last_run,
        last_success=state.last_success,
        last_error=state.last_error,
        last_duration_ms=state.last_duration_ms,
        total_runs=state.total_runs,
        successful_runs=state.successful_runs,
        last_teams_count=state.last_teams_count,
    )


@app.post("/api/scrapers/{scraper_id}/run", response_model=RunTaskResponse)
async def run_scraper(scraper_id: str, background_tasks: BackgroundTasks):
    """Trigger a scraper to run."""
    if scraper_id not in SCRAPERS:
        raise HTTPException(status_code=404, detail="Scraper not found")

    state = app_state.scrapers.get(scraper_id, ScraperState())
    if state.status == TaskStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Scraper is already running")

    # Run in background
    background_tasks.add_task(run_scraper_sync, scraper_id)

    return RunTaskResponse(
        success=True,
        message=f"Scraper '{scraper_id}' started successfully",
    )


@app.get("/api/scrapers/{scraper_id}/data")
async def get_scraper_data(scraper_id: str):
    """Get the latest scraped data for a scraper."""
    if scraper_id not in SCRAPERS:
        raise HTTPException(status_code=404, detail="Scraper not found")

    scraper = SCRAPERS[scraper_id]
    data = scraper.get_latest_data()

    if data is None:
        return JSONResponse(
            content={
                "scraper_id": scraper_id,
                "teams": [],
                "count": 0,
                "last_updated": None,
            }
        )

    state = app_state.scrapers.get(scraper_id, ScraperState())

    return JSONResponse(
        content={
            "scraper_id": scraper_id,
            "teams": data,
            "count": len(data),
            "last_updated": state.last_success,
        }
    )


@app.get("/api/scrapers/{scraper_id}/download/{file_type}")
async def download_file(scraper_id: str, file_type: str):
    """Download the latest output file (json or xlsx)."""
    if scraper_id not in SCRAPERS:
        raise HTTPException(status_code=404, detail="Scraper not found")

    state = app_state.scrapers.get(scraper_id, ScraperState())

    if file_type == "json":
        file_path = state.last_json_path
    elif file_type == "xlsx":
        file_path = state.last_xlsx_path
    else:
        raise HTTPException(
            status_code=400, detail="Invalid file type. Use 'json' or 'xlsx'"
        )

    if not file_path or not Path(file_path).exists():
        raise HTTPException(
            status_code=404, detail="File not found. Run the scraper first."
        )

    return FileResponse(
        path=file_path,
        filename=Path(file_path).name,
        media_type="application/octet-stream",
    )


@app.get("/api/files")
async def list_files():
    """List all generated data files."""
    files = []
    for file_path in DATA_DIR.glob("*.json"):
        if file_path.name == "scraper_state.json":
            continue
        stat = file_path.stat()
        files.append(
            {
                "name": file_path.name,
                "type": "json",
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            }
        )
    for file_path in DATA_DIR.glob("*.xlsx"):
        stat = file_path.stat()
        files.append(
            {
                "name": file_path.name,
                "type": "xlsx",
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            }
        )

    return sorted(files, key=lambda x: x["modified"], reverse=True)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
