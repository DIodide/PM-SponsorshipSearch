"""
Scraper API Server
FastAPI backend for managing and running scrape tasks.
"""

from __future__ import annotations

import asyncio
import json
import os
import httpx
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict, field
from enum import Enum
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
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


class EnrichmentTaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class EnrichmentTaskProgress:
    """Progress tracking for individual enricher within a task."""
    enricher_id: str
    enricher_name: str
    status: str = "pending"
    teams_processed: int = 0
    teams_enriched: int = 0
    teams_total: int = 0
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_ms: int = 0


@dataclass
class EnrichmentFieldDiff:
    """Represents a change to a single field."""
    field: str
    old_value: Any
    new_value: Any
    change_type: str  # "added", "modified", "removed"


@dataclass
class EnrichmentTeamDiff:
    """Represents all changes to a single team."""
    team_name: str
    changes: List[Dict[str, Any]] = field(default_factory=list)  # List of field changes
    fields_added: int = 0
    fields_modified: int = 0


@dataclass
class EnrichmentDiff:
    """Summary of all changes from an enrichment task."""
    teams_changed: int = 0
    total_fields_added: int = 0
    total_fields_modified: int = 0
    teams: List[EnrichmentTeamDiff] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "teams_changed": self.teams_changed,
            "total_fields_added": self.total_fields_added,
            "total_fields_modified": self.total_fields_modified,
            "teams": [
                {
                    "team_name": t.team_name,
                    "changes": t.changes,
                    "fields_added": t.fields_added,
                    "fields_modified": t.fields_modified,
                }
                for t in self.teams
            ]
        }


@dataclass
class EnrichmentTask:
    """Represents an async enrichment task."""
    id: str
    scraper_id: str
    scraper_name: str
    enricher_ids: List[str]
    status: EnrichmentTaskStatus = EnrichmentTaskStatus.PENDING
    progress: Dict[str, EnrichmentTaskProgress] = field(default_factory=dict)
    created_at: str = ""
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    teams_total: int = 0
    teams_enriched: int = 0
    error: Optional[str] = None
    # Diff tracking
    before_snapshot: Optional[Dict[str, Dict[str, Any]]] = None  # team_name -> fields
    diff: Optional[EnrichmentDiff] = None
    
    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now().isoformat()
        # Initialize progress for each enricher
        for enricher_id in self.enricher_ids:
            if enricher_id not in self.progress:
                enricher = EnricherRegistry.create(enricher_id)
                name = enricher.name if enricher else enricher_id
                self.progress[enricher_id] = EnrichmentTaskProgress(
                    enricher_id=enricher_id,
                    enricher_name=name,
                )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "scraper_id": self.scraper_id,
            "scraper_name": self.scraper_name,
            "enricher_ids": self.enricher_ids,
            "status": self.status.value,
            "progress": {k: asdict(v) for k, v in self.progress.items()},
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "teams_total": self.teams_total,
            "teams_enriched": self.teams_enriched,
            "error": self.error,
            "has_diff": self.diff is not None,
        }
    
    def get_diff_dict(self) -> Optional[Dict[str, Any]]:
        """Get the diff as a dictionary."""
        if self.diff is None:
            return None
        return self.diff.to_dict()


class EnrichmentTaskManager:
    """Manages async enrichment tasks with progress tracking."""
    
    def __init__(self):
        self._tasks: Dict[str, EnrichmentTask] = {}
        self._running_tasks: Dict[str, asyncio.Task] = {}
        self._task_history: List[EnrichmentTask] = []  # Keep last N completed tasks
        self._max_history = 50
        self._subscribers: Dict[str, List[asyncio.Queue]] = {}  # Task ID -> list of subscriber queues
    
    def create_task(
        self, 
        scraper_id: str, 
        scraper_name: str,
        enricher_ids: List[str],
        teams_total: int
    ) -> EnrichmentTask:
        """Create a new enrichment task."""
        task_id = str(uuid.uuid4())[:8]
        task = EnrichmentTask(
            id=task_id,
            scraper_id=scraper_id,
            scraper_name=scraper_name,
            enricher_ids=enricher_ids,
            teams_total=teams_total,
        )
        self._tasks[task_id] = task
        return task
    
    def get_task(self, task_id: str) -> Optional[EnrichmentTask]:
        """Get a task by ID."""
        return self._tasks.get(task_id)
    
    def list_tasks(self, include_history: bool = True) -> List[EnrichmentTask]:
        """List all active and optionally historical tasks."""
        tasks = list(self._tasks.values())
        if include_history:
            tasks.extend(self._task_history)
        # Sort by created_at descending
        return sorted(tasks, key=lambda t: t.created_at, reverse=True)
    
    def list_active_tasks(self) -> List[EnrichmentTask]:
        """List only running/pending tasks."""
        return [
            t for t in self._tasks.values() 
            if t.status in (EnrichmentTaskStatus.PENDING, EnrichmentTaskStatus.RUNNING)
        ]
    
    async def update_task_progress(
        self,
        task_id: str,
        enricher_id: str,
        **kwargs
    ):
        """Update progress for a specific enricher in a task."""
        task = self._tasks.get(task_id)
        if not task or enricher_id not in task.progress:
            return
        
        progress = task.progress[enricher_id]
        for key, value in kwargs.items():
            if hasattr(progress, key):
                setattr(progress, key, value)
        
        # Recalculate total enriched
        task.teams_enriched = sum(p.teams_enriched for p in task.progress.values())
        
        # Notify subscribers
        await self._notify_subscribers(task_id, task)
    
    async def mark_task_running(self, task_id: str):
        """Mark a task as running."""
        task = self._tasks.get(task_id)
        if task:
            task.status = EnrichmentTaskStatus.RUNNING
            task.started_at = datetime.now().isoformat()
            await self._notify_subscribers(task_id, task)
    
    async def mark_task_completed(self, task_id: str, error: Optional[str] = None):
        """Mark a task as completed or failed."""
        task = self._tasks.get(task_id)
        if task:
            task.status = EnrichmentTaskStatus.FAILED if error else EnrichmentTaskStatus.COMPLETED
            task.completed_at = datetime.now().isoformat()
            task.error = error
            await self._notify_subscribers(task_id, task)
            
            # Move to history
            self._move_to_history(task_id)
    
    def cancel_task(self, task_id: str) -> bool:
        """Cancel a running task."""
        if task_id in self._running_tasks:
            self._running_tasks[task_id].cancel()
            del self._running_tasks[task_id]
        
        task = self._tasks.get(task_id)
        if task:
            task.status = EnrichmentTaskStatus.CANCELLED
            task.completed_at = datetime.now().isoformat()
            self._move_to_history(task_id)
            return True
        return False
    
    def register_async_task(self, task_id: str, async_task: asyncio.Task):
        """Register the asyncio Task for a task ID."""
        self._running_tasks[task_id] = async_task
    
    def unregister_async_task(self, task_id: str):
        """Unregister the asyncio Task."""
        self._running_tasks.pop(task_id, None)
    
    def _move_to_history(self, task_id: str):
        """Move a completed task to history."""
        task = self._tasks.pop(task_id, None)
        if task:
            self._task_history.insert(0, task)
            # Trim history
            if len(self._task_history) > self._max_history:
                self._task_history = self._task_history[:self._max_history]
    
    # SSE Support
    def subscribe(self, task_id: str) -> asyncio.Queue:
        """Subscribe to updates for a specific task."""
        queue: asyncio.Queue = asyncio.Queue()
        if task_id not in self._subscribers:
            self._subscribers[task_id] = []
        self._subscribers[task_id].append(queue)
        return queue
    
    def unsubscribe(self, task_id: str, queue: asyncio.Queue):
        """Unsubscribe from task updates."""
        if task_id in self._subscribers:
            try:
                self._subscribers[task_id].remove(queue)
            except ValueError:
                pass
    
    async def _notify_subscribers(self, task_id: str, task: EnrichmentTask):
        """Notify all subscribers of a task update."""
        if task_id not in self._subscribers:
            return
        
        data = task.to_dict()
        for queue in self._subscribers[task_id]:
            try:
                await queue.put(data)
            except Exception:
                pass


# Global task manager
task_manager = EnrichmentTaskManager()


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


class CreateEnrichmentTaskRequest(BaseModel):
    scraper_id: str
    enricher_ids: List[str]


class EnrichmentTaskResponse(BaseModel):
    id: str
    scraper_id: str
    scraper_name: str
    enricher_ids: List[str]
    status: str
    progress: Dict[str, Any]
    created_at: str
    started_at: Optional[str]
    completed_at: Optional[str]
    teams_total: int
    teams_enriched: int
    error: Optional[str]
    has_diff: bool = False


class EnrichmentTaskListResponse(BaseModel):
    tasks: List[EnrichmentTaskResponse]
    active_count: int
    total_count: int


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
        raise HTTPException(
            status_code=404, detail=f"Enricher '{enricher_id}' not found"
        )

    enricher = enricher_class()
    info = enricher.get_info()
    return EnricherInfoResponse(
        id=info["id"],
        name=info["name"],
        description=info["description"],
        fields_added=info.get("fields_added", []),
        available=info.get("available", False),
    )


@app.post(
    "/api/scrapers/{scraper_id}/enrich", response_model=List[EnrichmentResultResponse]
)
async def run_enrichment(
    scraper_id: str, request: Optional[RunEnrichmentRequest] = None
):
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
        enricher_ids = [
            e["id"] for e in EnricherRegistry.list_all() if e.get("available", False)
        ]

    # Run enrichers
    results: List[EnrichmentResultResponse] = []

    for enricher_id in enricher_ids:
        enricher = EnricherRegistry.create(enricher_id)
        if not enricher:
            results.append(
                EnrichmentResultResponse(
                    success=False,
                    enricher_name=enricher_id,
                    teams_processed=0,
                    teams_enriched=0,
                    duration_ms=0,
                    timestamp=datetime.now().isoformat(),
                    error=f"Enricher '{enricher_id}' not found",
                )
            )
            continue

        if not enricher.is_available():
            results.append(
                EnrichmentResultResponse(
                    success=False,
                    enricher_name=enricher.name,
                    teams_processed=0,
                    teams_enriched=0,
                    duration_ms=0,
                    timestamp=datetime.now().isoformat(),
                    error=f"Enricher '{enricher.name}' is not available (missing configuration)",
                )
            )
            continue

        # Run the enricher
        result = await enricher.enrich(teams)
        results.append(
            EnrichmentResultResponse(
                success=result.success,
                enricher_name=result.enricher_name,
                teams_processed=result.teams_processed,
                teams_enriched=result.teams_enriched,
                duration_ms=result.duration_ms,
                timestamp=result.timestamp,
                error=result.error,
            )
        )

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


# ============ Async Enrichment Task Endpoints ============


def _compute_enrichment_diff(
    before_snapshot: Dict[str, Dict[str, Any]], 
    after_data: List[Dict[str, Any]]
) -> EnrichmentDiff:
    """Compute the diff between before and after enrichment states."""
    diff = EnrichmentDiff()
    
    # Fields to ignore in diff (metadata fields)
    ignore_fields = {"enrichments_applied", "last_enriched"}
    
    for team_dict in after_data:
        team_name = team_dict.get("name", "Unknown")
        before = before_snapshot.get(team_name, {})
        
        team_diff = EnrichmentTeamDiff(team_name=team_name)
        
        for field, new_value in team_dict.items():
            if field in ignore_fields:
                continue
            
            old_value = before.get(field)
            
            # Skip if both are None/empty
            if old_value is None and new_value is None:
                continue
            if old_value == [] and new_value == []:
                continue
            if old_value == new_value:
                continue
            
            # Determine change type
            if old_value is None or old_value == [] or old_value == "":
                if new_value is not None and new_value != [] and new_value != "":
                    change_type = "added"
                    team_diff.fields_added += 1
                else:
                    continue
            elif new_value is None or new_value == [] or new_value == "":
                # Field was removed (rare, but possible)
                change_type = "removed"
            else:
                change_type = "modified"
                team_diff.fields_modified += 1
            
            # Format values for display (truncate long lists/strings)
            def format_value(v):
                if v is None:
                    return None
                if isinstance(v, list):
                    if len(v) > 3:
                        return v[:3] + [f"...+{len(v)-3} more"]
                    return v
                if isinstance(v, str) and len(v) > 100:
                    return v[:100] + "..."
                return v
            
            team_diff.changes.append({
                "field": field,
                "old_value": format_value(old_value),
                "new_value": format_value(new_value),
                "change_type": change_type,
            })
        
        if team_diff.changes:
            diff.teams.append(team_diff)
            diff.teams_changed += 1
            diff.total_fields_added += team_diff.fields_added
            diff.total_fields_modified += team_diff.fields_modified
    
    # Sort teams by number of changes (descending)
    diff.teams.sort(key=lambda t: len(t.changes), reverse=True)
    
    return diff


async def _run_enrichment_task(task_id: str):
    """Background task to run enrichments with progress tracking."""
    task = task_manager.get_task(task_id)
    if not task:
        return
    
    try:
        await task_manager.mark_task_running(task_id)
        
        # Get scraper info and load data
        scraper_id = task.scraper_id
        state = app_state.scrapers.get(scraper_id, ScraperState())
        json_path = state.last_json_path
        
        if not json_path or not Path(json_path).exists():
            await task_manager.mark_task_completed(task_id, "No data file found")
            return
        
        # Load teams
        with open(json_path, "r") as f:
            teams_data = json.load(f)
        
        teams = [TeamRow.from_dict(t) for t in teams_data]
        task.teams_total = len(teams)
        
        # Store before snapshot for diff computation
        # Key by team name for easier lookup
        task.before_snapshot = {
            team.get("name", f"team_{i}"): dict(team)
            for i, team in enumerate(teams_data)
        }
        
        # Run each enricher sequentially with progress updates
        for enricher_id in task.enricher_ids:
            # Check if cancelled
            if task.status == EnrichmentTaskStatus.CANCELLED:
                break
            
            enricher = EnricherRegistry.create(enricher_id)
            if not enricher:
                await task_manager.update_task_progress(
                    task_id, enricher_id,
                    status="failed",
                    error=f"Enricher '{enricher_id}' not found"
                )
                continue
            
            if not enricher.is_available():
                await task_manager.update_task_progress(
                    task_id, enricher_id,
                    status="failed",
                    error="Enricher not available (missing configuration)"
                )
                continue
            
            # Mark enricher as running
            await task_manager.update_task_progress(
                task_id, enricher_id,
                status="running",
                started_at=datetime.now().isoformat(),
                teams_total=len(teams)
            )
            
            # Create progress callback for real-time updates
            async def make_progress_callback(eid: str):
                async def callback(processed: int, enriched: int, total: int):
                    await task_manager.update_task_progress(
                        task_id, eid,
                        status="running",
                        teams_processed=processed,
                        teams_enriched=enriched,
                        teams_total=total
                    )
                return callback
            
            progress_cb = await make_progress_callback(enricher_id)
            
            # Run the enricher with progress callback
            start_time = datetime.now()
            try:
                result = await enricher.enrich(teams, progress_callback=progress_cb)
                duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                
                await task_manager.update_task_progress(
                    task_id, enricher_id,
                    status="completed" if result.success else "failed",
                    teams_processed=result.teams_processed,
                    teams_enriched=result.teams_enriched,
                    completed_at=datetime.now().isoformat(),
                    duration_ms=duration_ms,
                    error=result.error
                )
            except asyncio.CancelledError:
                await task_manager.update_task_progress(
                    task_id, enricher_id,
                    status="cancelled",
                    completed_at=datetime.now().isoformat()
                )
                raise
            except Exception as e:
                duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                await task_manager.update_task_progress(
                    task_id, enricher_id,
                    status="failed",
                    completed_at=datetime.now().isoformat(),
                    duration_ms=duration_ms,
                    error=str(e)
                )
        
        # Save enriched data back to file
        enriched_data = [t.to_dict() for t in teams]
        with open(json_path, "w") as f:
            json.dump(enriched_data, f, indent=2)
        
        # Compute diff between before and after
        if task.before_snapshot:
            task.diff = _compute_enrichment_diff(task.before_snapshot, enriched_data)
        
        await task_manager.mark_task_completed(task_id)
        
    except asyncio.CancelledError:
        await task_manager.mark_task_completed(task_id, "Task was cancelled")
    except Exception as e:
        await task_manager.mark_task_completed(task_id, str(e))
    finally:
        task_manager.unregister_async_task(task_id)


@app.post("/api/enrichment-tasks", response_model=EnrichmentTaskResponse)
async def create_enrichment_task(request: CreateEnrichmentTaskRequest):
    """
    Create and start a new async enrichment task.
    
    This allows running enrichments in the background while tracking progress.
    Multiple tasks can run concurrently for different scrapers.
    """
    if request.scraper_id not in SCRAPERS:
        raise HTTPException(status_code=404, detail="Scraper not found")
    
    if not request.enricher_ids:
        raise HTTPException(status_code=400, detail="At least one enricher_id is required")
    
    # Validate enricher IDs
    for enricher_id in request.enricher_ids:
        if not EnricherRegistry.get(enricher_id):
            raise HTTPException(
                status_code=400, 
                detail=f"Enricher '{enricher_id}' not found"
            )
    
    # Get scraper info
    scraper_info = SCRAPER_INFO.get(request.scraper_id, {})
    state = app_state.scrapers.get(request.scraper_id, ScraperState())
    
    # Check if data exists
    json_path = state.last_json_path
    if not json_path or not Path(json_path).exists():
        raise HTTPException(
            status_code=404, 
            detail="No data file found. Run the scraper first."
        )
    
    # Get teams count
    with open(json_path, "r") as f:
        teams_data = json.load(f)
    teams_count = len(teams_data)
    
    # Create the task
    task = task_manager.create_task(
        scraper_id=request.scraper_id,
        scraper_name=scraper_info.get("name", request.scraper_id),
        enricher_ids=request.enricher_ids,
        teams_total=teams_count
    )
    
    # Start the background task
    async_task = asyncio.create_task(_run_enrichment_task(task.id))
    task_manager.register_async_task(task.id, async_task)
    
    return EnrichmentTaskResponse(**task.to_dict())


@app.get("/api/enrichment-tasks", response_model=EnrichmentTaskListResponse)
async def list_enrichment_tasks(active_only: bool = False):
    """List all enrichment tasks (active and historical)."""
    if active_only:
        tasks = task_manager.list_active_tasks()
    else:
        tasks = task_manager.list_tasks()
    
    active_count = len([t for t in tasks if t.status in (
        EnrichmentTaskStatus.PENDING, 
        EnrichmentTaskStatus.RUNNING
    )])
    
    return EnrichmentTaskListResponse(
        tasks=[EnrichmentTaskResponse(**t.to_dict()) for t in tasks],
        active_count=active_count,
        total_count=len(tasks)
    )


@app.get("/api/enrichment-tasks/{task_id}", response_model=EnrichmentTaskResponse)
async def get_enrichment_task(task_id: str):
    """Get the status of a specific enrichment task."""
    task = task_manager.get_task(task_id)
    
    # Also check history
    if not task:
        for historical in task_manager._task_history:
            if historical.id == task_id:
                task = historical
                break
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return EnrichmentTaskResponse(**task.to_dict())


@app.get("/api/enrichment-tasks/{task_id}/diff")
async def get_enrichment_task_diff(task_id: str):
    """
    Get the diff/changes made by an enrichment task.
    
    Returns a detailed breakdown of what fields were added or modified
    for each team during the enrichment process.
    
    Only available for completed tasks.
    """
    task = task_manager.get_task(task_id)
    
    # Also check history
    if not task:
        for historical in task_manager._task_history:
            if historical.id == task_id:
                task = historical
                break
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.status != EnrichmentTaskStatus.COMPLETED:
        raise HTTPException(
            status_code=400, 
            detail=f"Diff only available for completed tasks. Current status: {task.status.value}"
        )
    
    diff_dict = task.get_diff_dict()
    if diff_dict is None:
        # No diff available (shouldn't happen for completed tasks, but handle gracefully)
        return {
            "teams_changed": 0,
            "total_fields_added": 0,
            "total_fields_modified": 0,
            "teams": [],
        }
    
    return diff_dict


@app.delete("/api/enrichment-tasks/{task_id}")
async def cancel_enrichment_task(task_id: str):
    """Cancel a running enrichment task."""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.status not in (EnrichmentTaskStatus.PENDING, EnrichmentTaskStatus.RUNNING):
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot cancel task with status '{task.status.value}'"
        )
    
    if task_manager.cancel_task(task_id):
        return {"success": True, "message": "Task cancelled"}
    else:
        raise HTTPException(status_code=500, detail="Failed to cancel task")


@app.get("/api/enrichment-tasks/{task_id}/stream")
async def stream_task_updates(task_id: str):
    """
    Server-Sent Events endpoint for real-time task updates.
    
    Connect to this endpoint to receive live updates about task progress.
    """
    task = task_manager.get_task(task_id)
    
    # Also check history for completed tasks
    if not task:
        for historical in task_manager._task_history:
            if historical.id == task_id:
                task = historical
                break
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    async def event_generator():
        # Send initial state
        yield f"data: {json.dumps(task.to_dict())}\n\n"
        
        # If task is already completed, close the stream
        if task.status in (
            EnrichmentTaskStatus.COMPLETED, 
            EnrichmentTaskStatus.FAILED, 
            EnrichmentTaskStatus.CANCELLED
        ):
            return
        
        # Subscribe to updates
        queue = task_manager.subscribe(task_id)
        try:
            while True:
                try:
                    # Wait for updates with timeout
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(data)}\n\n"
                    
                    # Check if task is done
                    if data.get("status") in ("completed", "failed", "cancelled"):
                        break
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield ": keepalive\n\n"
        finally:
            task_manager.unsubscribe(task_id, queue)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
