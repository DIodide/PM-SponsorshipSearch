"""
Scraper API Server
FastAPI backend for managing and running scrape tasks.
"""

from __future__ import annotations

import asyncio
import json
import os
import httpx
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
from scrapers.models import TeamRow
from scrapers.enrichers.base import EnricherRegistry, BaseEnricher

# Gemini API config
GEMINI_API_KEY = os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", "")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


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
        "https://f6f844967574.ngrok-free.app",
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


class UpdateTeamRequest(BaseModel):
    index: int
    field: str
    value: str


class CleanRegionsResponse(BaseModel):
    success: bool
    updated_count: int
    message: str


class EnricherInfoResponse(BaseModel):
    id: str
    name: str
    description: str
    fields_added: List[str]
    available: bool
    status: str = "idle"


class EnrichmentResultResponse(BaseModel):
    success: bool
    enricher_name: str
    teams_processed: int
    teams_enriched: int
    duration_ms: int
    timestamp: str
    error: Optional[str] = None


class RunEnrichmentRequest(BaseModel):
    enricher_ids: Optional[List[str]] = None  # If None, run all available enrichers


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


@app.put("/api/scrapers/{scraper_id}/team")
async def update_team(scraper_id: str, request: UpdateTeamRequest):
    """Update a specific field of a team in the data file."""
    if scraper_id not in SCRAPERS:
        raise HTTPException(status_code=404, detail="Scraper not found")

    state = app_state.scrapers.get(scraper_id, ScraperState())
    json_path = state.last_json_path

    if not json_path or not Path(json_path).exists():
        raise HTTPException(
            status_code=404, detail="No data file found. Run the scraper first."
        )

    # Load data
    with open(json_path, "r") as f:
        teams = json.load(f)

    if request.index < 0 or request.index >= len(teams):
        raise HTTPException(status_code=400, detail="Invalid team index")

    # Update the field
    if request.field not in teams[request.index]:
        raise HTTPException(status_code=400, detail=f"Invalid field: {request.field}")

    old_value = teams[request.index][request.field]
    teams[request.index][request.field] = request.value

    # Save back to file
    with open(json_path, "w") as f:
        json.dump(teams, f, indent=2)

    return {
        "success": True,
        "old_value": old_value,
        "new_value": request.value,
    }


async def clean_regions_with_gemini(
    teams: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Use Gemini to clean and reconcile region names based on team names."""
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_GENERATIVE_AI_API_KEY environment variable not set",
        )

    # Batch teams for efficiency (50 at a time)
    BATCH_SIZE = 50
    updated_teams = teams.copy()

    for batch_start in range(0, len(teams), BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, len(teams))
        batch = teams[batch_start:batch_end]

        # Create prompt for this batch
        team_list = []
        for i, team in enumerate(batch):
            team_list.append(
                f'{i}. "{team["name"]}" (current region: "{team["region"]}")'
            )

        prompt = f"""You are a sports data expert. For each team below, verify and correct the "region" field.
The region should be the city or geographic area where the team is based (e.g., "Boston", "Los Angeles", "San Francisco Bay Area").

Teams to process:
{chr(10).join(team_list)}

Return a JSON array where each element is an object with:
- "index": the team's index number
- "corrected_region": the correct region name

Only include teams where the region needs correction. If a team's region is already correct, exclude it from the response.

Return ONLY the JSON array, no explanation or markdown formatting."""

        # Call Gemini API
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 2048,
            },
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                    json=payload,
                    headers=headers,
                    timeout=60.0,
                )
                response.raise_for_status()

                result = response.json()
                text = result["candidates"][0]["content"]["parts"][0]["text"]

                # Parse JSON from response (handle potential markdown code blocks)
                text = text.strip()
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                    text = text.strip()

                corrections = json.loads(text)

                # Apply corrections to the batch
                for correction in corrections:
                    idx = correction.get("index")
                    new_region = correction.get("corrected_region")
                    if idx is not None and new_region:
                        actual_idx = batch_start + idx
                        if 0 <= actual_idx < len(updated_teams):
                            updated_teams[actual_idx]["region"] = new_region

        except httpx.HTTPStatusError as e:
            print(f"Gemini API error for batch {batch_start}: {e}")
            continue
        except json.JSONDecodeError as e:
            print(f"Failed to parse Gemini response for batch {batch_start}: {e}")
            continue
        except Exception as e:
            print(f"Unexpected error for batch {batch_start}: {e}")
            continue

    return updated_teams


@app.post(
    "/api/scrapers/{scraper_id}/clean-regions", response_model=CleanRegionsResponse
)
async def clean_regions(scraper_id: str):
    """Clean and reconcile region names using AI."""
    if scraper_id not in SCRAPERS:
        raise HTTPException(status_code=404, detail="Scraper not found")

    state = app_state.scrapers.get(scraper_id, ScraperState())
    json_path = state.last_json_path

    if not json_path or not Path(json_path).exists():
        raise HTTPException(
            status_code=404, detail="No data file found. Run the scraper first."
        )

    # Load data
    with open(json_path, "r") as f:
        original_teams = json.load(f)

    # Clean regions with Gemini
    cleaned_teams = await clean_regions_with_gemini(original_teams)

    # Count updates
    updated_count = sum(
        1
        for orig, cleaned in zip(original_teams, cleaned_teams)
        if orig["region"] != cleaned["region"]
    )

    # Save back to file
    with open(json_path, "w") as f:
        json.dump(cleaned_teams, f, indent=2)

    return CleanRegionsResponse(
        success=True,
        updated_count=updated_count,
        message=f"Cleaned {updated_count} region(s) successfully",
    )


# ============ Enrichment Endpoints ============


@app.get("/api/enrichers", response_model=List[EnricherInfoResponse])
async def list_enrichers():
    """List all available enrichers with their status."""
    enrichers = EnricherRegistry.list_all()
    return [
        EnricherInfoResponse(
            id=e["id"],
            name=e["name"],
            description=e["description"],
            fields_added=e.get("fields_added", []),
            available=e.get("available", False),
        )
        for e in enrichers
    ]


@app.get("/api/enrichers/{enricher_id}", response_model=EnricherInfoResponse)
async def get_enricher(enricher_id: str):
    """Get information about a specific enricher."""
    enricher_class = EnricherRegistry.get(enricher_id)
    if not enricher_class:
        raise HTTPException(status_code=404, detail=f"Enricher '{enricher_id}' not found")
    
    enricher = enricher_class()
    info = enricher.get_info()
    return EnricherInfoResponse(
        id=info["id"],
        name=info["name"],
        description=info["description"],
        fields_added=info.get("fields_added", []),
        available=info.get("available", False),
    )


@app.post("/api/scrapers/{scraper_id}/enrich", response_model=List[EnrichmentResultResponse])
async def run_enrichment(scraper_id: str, request: Optional[RunEnrichmentRequest] = None):
    """
    Run enrichment on scraped data.
    
    If enricher_ids is provided, only those enrichers will run.
    If enricher_ids is None or empty, all available enrichers will run.
    """
    if scraper_id not in SCRAPERS:
        raise HTTPException(status_code=404, detail="Scraper not found")
    
    state = app_state.scrapers.get(scraper_id, ScraperState())
    json_path = state.last_json_path
    
    if not json_path or not Path(json_path).exists():
        raise HTTPException(
            status_code=404, detail="No data file found. Run the scraper first."
        )
    
    # Load data
    with open(json_path, "r") as f:
        teams_data = json.load(f)
    
    # Convert to TeamRow objects
    teams = [TeamRow.from_dict(t) for t in teams_data]
    
    # Determine which enrichers to run
    if request and request.enricher_ids:
        enricher_ids = request.enricher_ids
    else:
        # Run all available enrichers
        enricher_ids = [e["id"] for e in EnricherRegistry.list_all() if e.get("available", False)]
    
    # Run enrichers
    results: List[EnrichmentResultResponse] = []
    
    for enricher_id in enricher_ids:
        enricher = EnricherRegistry.create(enricher_id)
        if not enricher:
            results.append(EnrichmentResultResponse(
                success=False,
                enricher_name=enricher_id,
                teams_processed=0,
                teams_enriched=0,
                duration_ms=0,
                timestamp=datetime.now().isoformat(),
                error=f"Enricher '{enricher_id}' not found",
            ))
            continue
        
        if not enricher.is_available():
            results.append(EnrichmentResultResponse(
                success=False,
                enricher_name=enricher.name,
                teams_processed=0,
                teams_enriched=0,
                duration_ms=0,
                timestamp=datetime.now().isoformat(),
                error=f"Enricher '{enricher.name}' is not available (missing configuration)",
            ))
            continue
        
        # Run the enricher
        result = await enricher.enrich(teams)
        results.append(EnrichmentResultResponse(
            success=result.success,
            enricher_name=result.enricher_name,
            teams_processed=result.teams_processed,
            teams_enriched=result.teams_enriched,
            duration_ms=result.duration_ms,
            timestamp=result.timestamp,
            error=result.error,
        ))
    
    # Save enriched data back to file
    enriched_data = [t.to_dict() for t in teams]
    with open(json_path, "w") as f:
        json.dump(enriched_data, f, indent=2)
    
    return results


@app.get("/api/scrapers/{scraper_id}/enrichment-status")
async def get_enrichment_status(scraper_id: str):
    """Get the enrichment status for a scraper's data."""
    if scraper_id not in SCRAPERS:
        raise HTTPException(status_code=404, detail="Scraper not found")
    
    state = app_state.scrapers.get(scraper_id, ScraperState())
    json_path = state.last_json_path
    
    if not json_path or not Path(json_path).exists():
        return {
            "has_data": False,
            "teams_count": 0,
            "enrichments": {},
        }
    
    # Load data to check enrichment status
    with open(json_path, "r") as f:
        teams_data = json.load(f)
    
    # Count enrichments
    enrichment_counts: Dict[str, int] = {}
    for team in teams_data:
        applied = team.get("enrichments_applied") or []
        for e in applied:
            enrichment_counts[e] = enrichment_counts.get(e, 0) + 1
    
    return {
        "has_data": True,
        "teams_count": len(teams_data),
        "enrichments": enrichment_counts,
        "available_enrichers": [e["id"] for e in EnricherRegistry.list_all()],
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
