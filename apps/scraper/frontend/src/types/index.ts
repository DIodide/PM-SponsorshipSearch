export interface ScraperInfo {
  id: string;
  name: string;
  description: string;
  source_url: string;
  status: 'idle' | 'running' | 'success' | 'failed';
  last_run: string | null;
  last_success: string | null;
  last_error: string | null;
  last_duration_ms: number;
  total_runs: number;
  successful_runs: number;
  last_teams_count: number;
}

export interface TeamData {
  name: string;
  region: string;
  league: string;
  target_demographic: string;
  official_url: string;
  category: string;
  sport_id?: number;
  team_id?: number;
  logo_url?: string;
}

export interface DataResponse {
  scraper_id: string;
  teams: TeamData[];
  count: number;
  last_updated: string | null;
}

export interface FileInfo {
  name: string;
  type: 'json' | 'xlsx';
  size: number;
  modified: string;
}

