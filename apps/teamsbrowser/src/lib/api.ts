import type { Team } from '../types';

const CONVEX_URL = 'https://harmless-corgi-891.convex.cloud';

export async function fetchAllTeams(): Promise<Team[]> {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'scraperImport:getSampleTeams',
      args: { limit: 2000 }, // Get all teams
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch teams');
  }

  const data = await response.json();
  return data.value || [];
}

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

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—';
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
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
