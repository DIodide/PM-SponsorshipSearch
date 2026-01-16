import type { Team, ScoredTeam, SearchFilters } from '../types';

const CONVEX_URL = 'https://harmless-corgi-891.convex.cloud';

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
 * Compute brand similarity using Convex action
 * This calls the computeBrandSimilarity action which:
 * 1. Embeds the brand inputs using Gemini
 * 2. Computes cosine similarity against each team's embeddings
 * 3. Returns teams sorted by similarity score
 */
export async function computeSimilarity(
  query: string,
  filters: SearchFilters
): Promise<ScoredTeam[]> {
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
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Similarity computation failed:', errorText);
    throw new Error('Failed to compute similarity');
  }

  const data = await response.json();
  return data.value || [];
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
