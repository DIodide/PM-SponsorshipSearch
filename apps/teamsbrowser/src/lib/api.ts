import type { Team, ScoredTeam, SearchFilters, TeamDetailAnalysis, GeneratedCampaign, PaginatedSimilarityResponse } from '../types';

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || 'https://harmless-corgi-891.convex.cloud';

/**
 * Fetch all teams from All_Teams table (for additional info)
 */
export async function fetchAllTeams(): Promise<Team[]> {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'scraperImport:getSampleTeams',
      args: { limit: 2000 },
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch teams');
  }

  const data = await response.json();
  return data.value || [];
}

/**
 * Fetch the total count of teams in the All_Teams_Clean table
 */
export async function fetchTeamCount(): Promise<number> {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'All_Teams_Clean:getCount',
      args: {},
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch team count');
  }

  const data = await response.json();
  return data.value || 0;
}

/**
 * Fetch all cleaned teams from All_Teams_Clean table
 */
export async function fetchAllTeamsClean(): Promise<ScoredTeam[]> {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'All_Teams_Clean:getAll',
      args: {},
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch cleaned teams');
  }

  const data = await response.json();
  // Add default similarity score of 0 for all teams
  return (data.value || []).map((team: ScoredTeam) => ({
    ...team,
    similarity_score: 0,
  }));
}

/**
 * Compute brand similarity using Convex action with pagination support
 * This calls the computeBrandSimilarity action which:
 * 1. Embeds the brand inputs using Gemini
 * 2. Computes cosine similarity against each team's embeddings
 * 3. Returns paginated teams sorted by similarity score
 */
export async function computeSimilarity(
  query: string,
  filters: SearchFilters,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedSimilarityResponse> {
  const response = await fetch(`${CONVEX_URL}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'similarityScoring:computeBrandSimilarity',
      args: {
        query,
        filters: {
          regions: filters.regions,
          demographics: filters.demographics,
          brandValues: filters.brandValues,
          leagues: filters.leagues,
          goals: filters.goals,
          budgetMin: filters.budgetMin,
          budgetMax: filters.budgetMax,
        },
        page,
        pageSize,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Similarity computation failed:', errorText);
    throw new Error('Failed to compute similarity');
  }

  const data = await response.json();
  return data.value || {
    teams: [],
    totalCount: 0,
    totalPages: 0,
    currentPage: 1,
    pageSize,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

/**
 * Generate AI-powered team analysis using Convex action
 * Calls Gemini on the server side for security
 */
export async function generateTeamAnalysis(
  scoredTeam: ScoredTeam,
  fullTeam: Team | undefined,
  filters: SearchFilters
): Promise<TeamDetailAnalysis> {
  // Prepare the fullTeam data for the Convex action
  const fullTeamData = fullTeam ? {
    name: fullTeam.name,
    stadium_name: fullTeam.stadium_name,
    owns_stadium: fullTeam.owns_stadium,
    avg_game_attendance: fullTeam.avg_game_attendance,
    franchise_value: fullTeam.franchise_value,
    geo_city: fullTeam.geo_city,
    sponsors: fullTeam.sponsors,
    community_programs: fullTeam.community_programs,
    cause_partnerships: fullTeam.cause_partnerships,
    family_program_types: fullTeam.family_program_types,
    family_program_count: fullTeam.family_program_count,
    mission_tags: fullTeam.mission_tags,
  } : undefined;

  const response = await fetch(`${CONVEX_URL}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'teamAnalysis:generateTeamAnalysis',
      args: {
        scoredTeam: {
          _id: scoredTeam._id,
          name: scoredTeam.name,
          region: scoredTeam.region,
          league: scoredTeam.league,
          official_url: scoredTeam.official_url,
          digital_reach: scoredTeam.digital_reach,
          local_reach: scoredTeam.local_reach,
          family_friendly: scoredTeam.family_friendly,
          value_tier: scoredTeam.value_tier,
        },
        fullTeam: fullTeamData,
        filters: {
          regions: filters.regions,
          demographics: filters.demographics,
          brandValues: filters.brandValues,
          leagues: filters.leagues,
          goals: filters.goals,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Team analysis generation failed:', errorText);
    throw new Error('Failed to generate team analysis');
  }

  const data = await response.json();
  return data.value;
}

/**
 * Get team stats
 */
export async function fetchTeamStats(): Promise<{
  total: number;
  byLeague: Record<string, number>;
}> {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'scraperImport:getTeamsByLeague',
      args: {},
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch team stats');
  }

  const data = await response.json();
  return data.value || { total: 0, byLeague: {} };
}

/**
 * Format number as currency or with K/M/B suffixes
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—';
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

export function formatFollowers(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export function getTotalFollowers(team: Team): number {
  return (
    (team.followers_x || 0) +
    (team.followers_instagram || 0) +
    (team.followers_facebook || 0) +
    (team.followers_tiktok || 0) +
    (team.subscribers_youtube || 0)
  );
}

/**
 * Infer sport from league name
 */
export function inferSport(league: string | null | undefined): string {
  if (!league) return 'Sports';
  const l = league.toLowerCase();
  if (l.includes('nfl') || l.includes('football')) return 'Football';
  if (l.includes('nba') || l.includes('basketball') || l.includes('g league') || l.includes('wnba')) return 'Basketball';
  if (l.includes('mlb') || l.includes('baseball') || l.includes('triple-a') || l.includes('double-a') || l.includes('class a') || l.includes('high-a')) return 'Baseball';
  if (l.includes('nhl') || l.includes('hockey') || l.includes('ahl') || l.includes('echl')) return 'Hockey';
  if (l.includes('mls') || l.includes('soccer') || l.includes('usl') || l.includes('nwsl') || l.includes('wpsl')) return 'Soccer';
  return 'Sports';
}

/**
 * Estimate partnership price based on value tier
 */
export function estimatePriceFromTier(valueTier: number, league: string | null): number {
  // Base prices by tier
  const tierPrices: Record<number, number> = {
    1: 250000,  // Budget-friendly
    2: 750000,  // Mid-tier
    3: 2500000, // Premium
  };
  
  let basePrice = tierPrices[valueTier] || 500000;
  
  // Adjust by league
  const leagueLower = (league || '').toLowerCase();
  if (leagueLower.includes('nfl') || leagueLower.includes('nba') || leagueLower.includes('mlb') || leagueLower.includes('nhl')) {
    basePrice *= 2;
  } else if (leagueLower.includes('mls') || leagueLower.includes('nwsl')) {
    basePrice *= 0.8;
  } else if (leagueLower.includes('minor') || leagueLower.includes('usl')) {
    basePrice *= 0.5;
  }
  
  return Math.round(basePrice / 100000) * 100000;
}

/**
 * Convert similarity score (-1 to 1) to percentage (0-100)
 */
export function scoreToPercent(score: number): number {
  // Score ranges from approximately -1 to 1
  // Convert to 0-100 range
  const normalized = ((score + 1) / 2) * 100;
  return Math.round(Math.min(100, Math.max(0, normalized)));
}

// ----------------------
// File Upload Functions
// ----------------------

/**
 * Get an upload URL from Convex storage
 */
export async function getUploadUrl(): Promise<string> {
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'storage:generateUploadUrl',
      args: {},
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to get upload URL');
  }

  const data = await response.json();
  return data.value;
}

/**
 * Upload a file to Convex storage and return the storage ID
 */
export async function uploadCreativeFile(file: File): Promise<string> {
  // Get upload URL
  const uploadUrl = await getUploadUrl();

  // Upload the file
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file');
  }

  const { storageId } = await uploadResponse.json();
  
  // Get the file URL
  const urlResponse = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'storage:getFileUrl',
      args: { storageId },
    }),
  });

  if (!urlResponse.ok) {
    throw new Error('Failed to get file URL');
  }

  const urlData = await urlResponse.json();
  return urlData.value;
}

// ----------------------
// Campaign Generation Functions
// ----------------------

export interface GenerateCampaignParams {
  teamId: string;
  teamName: string;
  teamLeague: string;
  teamRegion: string;
  mediaStrategy: string;
  touchpoints: string[];
  notes?: string;
  uploadedImageUrls?: string[];
  generateVisuals?: boolean;
}

/**
 * Generate a campaign using AI
 */
export async function generateCampaign(params: GenerateCampaignParams): Promise<GeneratedCampaign> {
  const response = await fetch(`${CONVEX_URL}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'campaignGeneration:generateCampaign',
      args: params,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Campaign generation failed:', errorText);
    throw new Error('Failed to generate campaign');
  }

  const data = await response.json();
  return data.value;
}

export interface GenerateVisualsParams {
  teamName: string;
  teamLeague: string;
  campaignTitle: string;
  touchpoints: string[];
  customPrompts?: string[];
  count?: number;
}

/**
 * Generate campaign visuals using AI
 */
export async function generateCampaignVisuals(params: GenerateVisualsParams): Promise<string[]> {
  const response = await fetch(`${CONVEX_URL}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'campaignGeneration:regenerateVisuals',
      args: params,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Visual generation failed:', errorText);
    throw new Error('Failed to generate visuals');
  }

  const data = await response.json();
  return data.value || [];
}
