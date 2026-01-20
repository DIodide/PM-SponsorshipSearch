import type { ScoredTeam, TeamRecommendation, TeamDetailAnalysis, SearchFilters, Team } from '../types';
import { inferSport, estimatePriceFromTier, scoreToPercent, generateTeamAnalysis } from './api';

/**
 * Convert scored teams from similarity search into recommendation format
 */
export function scoredTeamsToRecommendations(
  scoredTeams: ScoredTeam[],
  fullTeams?: Team[]
): TeamRecommendation[] {
  // Create a map for quick lookup of full team data
  const fullTeamMap = new Map<string, Team>();
  if (fullTeams) {
    fullTeams.forEach(t => fullTeamMap.set(t.name.toLowerCase(), t));
  }
  
  return scoredTeams.map(scoredTeam => {
    const fullTeam = fullTeamMap.get(scoredTeam.name.toLowerCase());
    const matchPercent = scoreToPercent(scoredTeam.similarity_score);
    const priceEstimate = estimatePriceFromTier(scoredTeam.value_tier, scoredTeam.league);
    const sport = inferSport(scoredTeam.league);
    
    return {
      scoredTeam,
      fullTeam,
      matchPercent,
      priceEstimate,
      sport,
    };
  });
}

/**
 * Generate AI-powered team analysis for detail view
 * Now calls the Convex action server-side for security
 */
export async function generateTeamDetailAnalysis(
  scoredTeam: ScoredTeam,
  fullTeam: Team | undefined,
  filters: SearchFilters
): Promise<TeamDetailAnalysis> {
  return generateTeamAnalysis(scoredTeam, fullTeam, filters);
}

export function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`.replace('.0M', 'M');
  }
  return `$${amount.toLocaleString()}`;
}
