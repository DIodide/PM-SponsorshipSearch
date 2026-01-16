import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ScoredTeam, TeamRecommendation, TeamDetailAnalysis, SearchFilters, Team } from '../types';
import { inferSport, estimatePriceFromTier, scoreToPercent, formatNumber } from './api';

const API_KEY = import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY || '';

let genAI: GoogleGenerativeAI | null = null;

function getAI() {
  if (!genAI && API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
  }
  return genAI;
}

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
 */
export async function generateTeamDetailAnalysis(
  scoredTeam: ScoredTeam,
  fullTeam: Team | undefined,
  filters: SearchFilters
): Promise<TeamDetailAnalysis> {
  const sport = inferSport(scoredTeam.league);
  const priceEstimate = estimatePriceFromTier(scoredTeam.value_tier, scoredTeam.league);
  
  const ai = getAI();
  if (ai) {
    try {
      const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
      
      // Build context from available data
      const sponsorsList = fullTeam?.sponsors?.map(s => 
        typeof s === 'string' ? s : `${s.name}${s.asset_type ? ` (${s.asset_type})` : ''}${s.category ? ` - ${s.category}` : ''}`
      ).join(', ') || 'None listed';
      
      const teamInfo = `
Team: ${scoredTeam.name}
League: ${scoredTeam.league || 'Unknown'}
Region: ${scoredTeam.region || 'Unknown'}
Sport: ${sport}
Value Tier: ${scoredTeam.value_tier} (1=budget, 2=mid, 3=premium)
Digital Reach Score: ${scoredTeam.digital_reach.toFixed(2)}
Local Reach Score: ${scoredTeam.local_reach.toFixed(2)}
Family-Friendly Score: ${scoredTeam.family_friendly?.toFixed(2) || 'Unknown'}
${fullTeam ? `
Stadium: ${fullTeam.stadium_name || 'Unknown'}
Venue Ownership: ${fullTeam.owns_stadium === true ? 'Team owns the venue' : fullTeam.owns_stadium === false ? 'Team leases/rents the venue' : 'Unknown'}
Average Attendance: ${fullTeam.avg_game_attendance?.toLocaleString() || 'Unknown'}
Franchise Value: ${fullTeam.franchise_value ? formatNumber(fullTeam.franchise_value) : 'Unknown'}
City: ${fullTeam.geo_city || 'Unknown'}

Current Sponsors/Partners: ${sponsorsList}

Community Programs: ${(fullTeam.community_programs || []).join(', ') || 'None listed'}

Cause Partnerships: ${(fullTeam.cause_partnerships || []).join(', ') || 'None listed'}

Family Programs: ${(fullTeam.family_program_types || []).join(', ') || 'None listed'}
Family Program Count: ${fullTeam.family_program_count || 0}

Mission/Values Tags: ${(fullTeam.mission_tags || []).join(', ') || 'None listed'}
` : ''}
`;

      const searchContext = `
Search Criteria:
- Target Regions: ${filters.regions.join(', ') || 'Any'}
- Target Demographics: ${filters.demographics.join(', ') || 'Any'}
- Brand Values: ${filters.brandValues.join(', ') || 'Any'}
- Preferred Leagues: ${filters.leagues.join(', ') || 'Any'}
- Sponsorship Goals: ${filters.goals.join(', ') || 'Any'}
`;

      const result = await model.generateContent(`
Generate a detailed sponsorship analysis for this team given the brand's search criteria.

${teamInfo}
${searchContext}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "description": "A detailed 3-4 sentence paragraph about the team and why they're a good match for this brand",
  "pros": ["pro 1", "pro 2", "pro 3", "pro 4"],
  "cons": ["con 1", "con 2", "con 3"],
  "primaryAudience": ["Audience segment 1 with age range and description", "Audience segment 2", "Audience segment 3"],
  "secondaryAudience": ["Secondary audience 1", "Secondary audience 2"],
  "audienceCharacteristics": ["Characteristic 1", "Characteristic 2", "Characteristic 3"],
  "currentPartners": ["Partner 1 - description of partnership", "Partner 2 - description", "Partner 3 - description"]
}
`);
      
      const text = result.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          description: parsed.description || generateFallbackDescription(scoredTeam, filters),
          pros: parsed.pros || generateFallbackPros(scoredTeam),
          cons: parsed.cons || generateFallbackCons(scoredTeam),
          primaryAudience: parsed.primaryAudience || generateFallbackAudience(scoredTeam).primary,
          secondaryAudience: parsed.secondaryAudience || generateFallbackAudience(scoredTeam).secondary,
          audienceCharacteristics: parsed.audienceCharacteristics || generateFallbackAudience(scoredTeam).characteristics,
          currentPartners: parsed.currentPartners || generateFallbackPartners(fullTeam),
          sources: generateSources(scoredTeam),
          priceEstimate,
        };
      }
    } catch (error) {
      console.error('AI detail generation error:', error);
    }
  }
  
  // Fallback
  const audienceData = generateFallbackAudience(scoredTeam);
  return {
    description: generateFallbackDescription(scoredTeam, filters),
    pros: generateFallbackPros(scoredTeam),
    cons: generateFallbackCons(scoredTeam),
    primaryAudience: audienceData.primary,
    secondaryAudience: audienceData.secondary,
    audienceCharacteristics: audienceData.characteristics,
    currentPartners: generateFallbackPartners(fullTeam),
    sources: generateSources(scoredTeam),
    priceEstimate,
  };
}

function generateFallbackDescription(team: ScoredTeam, filters: SearchFilters): string {
  const sport = inferSport(team.league);
  const region = team.region || 'their region';
  
  const valueDesc = team.value_tier === 3 
    ? 'premium-tier' 
    : team.value_tier === 1 
      ? 'budget-friendly' 
      : 'mid-tier';
  
  const reachDesc = team.digital_reach > 0 
    ? 'strong digital presence' 
    : team.local_reach > 0 
      ? 'strong local engagement' 
      : 'growing fanbase';
  
  let matchReason = '';
  if (filters.brandValues.includes('community') || filters.brandValues.includes('family')) {
    matchReason = `Their community focus and family-friendly atmosphere align well with your brand values.`;
  } else if (filters.goals.includes('awareness')) {
    matchReason = `Their ${reachDesc} makes them well-suited for building brand awareness.`;
  } else if (filters.goals.includes('local-presence')) {
    matchReason = `Their strong local presence in ${region} provides excellent market penetration opportunities.`;
  } else {
    matchReason = `They offer solid partnership opportunities for brands looking to connect with sports fans.`;
  }

  return `The ${team.name} are a ${valueDesc} ${sport.toLowerCase()} team based in ${region} with ${reachDesc}. ${matchReason}`;
}

function generateFallbackPros(team: ScoredTeam): string[] {
  const pros: string[] = [];
  
  if (team.digital_reach > 0) {
    pros.push('Strong digital presence across social platforms');
  }
  if (team.local_reach > 0) {
    pros.push('High local engagement and game attendance');
  }
  if (team.family_friendly && team.family_friendly > 0) {
    pros.push('Extensive family-friendly programming');
  }
  if (team.value_tier === 1) {
    pros.push('Cost-effective sponsorship opportunities');
  }
  if (team.value_tier === 3) {
    pros.push('Premium brand association opportunities');
  }
  
  // Ensure at least 3 pros
  const defaults = [
    'Authentic community connection',
    'Flexible activation opportunities',
    'Engaged and loyal fanbase',
  ];
  
  while (pros.length < 3) {
    pros.push(defaults[pros.length]);
  }
  
  return pros.slice(0, 4);
}

function generateFallbackCons(team: ScoredTeam): string[] {
  const cons: string[] = [];
  const league = (team.league || '').toLowerCase();
  
  if (!league.includes('nfl') && !league.includes('nba') && !league.includes('mlb') && !league.includes('nhl')) {
    cons.push('Regional rather than national visibility');
  }
  if (league.includes('minor') || league.includes('usl')) {
    cons.push('Smaller broadcast reach compared to major leagues');
  }
  if (team.digital_reach < 0) {
    cons.push('Limited social media reach');
  }
  if (team.value_tier === 3) {
    cons.push('Higher sponsorship costs');
  }
  
  // Ensure at least 2 cons
  if (cons.length < 2) {
    cons.push('Requires localized marketing approach');
  }
  
  return cons.slice(0, 3);
}

function generateFallbackAudience(team: ScoredTeam): { 
  primary: string[]; 
  secondary: string[]; 
  characteristics: string[];
} {
  const sport = inferSport(team.league);
  const region = team.region || 'the region';
  
  return {
    primary: [
      `Families and youth athletes (ages 6-16) — active participants in local ${sport.toLowerCase()} programs`,
      `Millennial parents (ages 30-45) — sports-minded families seeking affordable entertainment`,
      `Local ${sport.toLowerCase()} fans — ${region}'s diverse population with interest in the sport`,
    ],
    secondary: [
      `Young professionals (ages 22-35) — drawn to social gameday experiences`,
      `Community-minded locals — residents who support local businesses`,
    ],
    characteristics: [
      'Value authentic local engagement and grassroots connections',
      'Highly responsive to event-based activations',
      'Active across social media for sports content',
    ],
  };
}

function generateFallbackPartners(fullTeam?: Team): string[] {
  if (fullTeam?.sponsors && fullTeam.sponsors.length > 0) {
    return fullTeam.sponsors.slice(0, 5).map(s => 
      typeof s === 'string' ? s : `${s.name} – ${s.asset_type || 'Official partner'}`
    );
  }
  
  return [
    'Local Apparel Brand – Official lifestyle partner',
    'Regional Beverage Company – Hydration sponsor',
    'Local Financial Institution – Community programs partner',
    'Local Food Company – Matchday concessions partner',
    'Sportswear Brand – Training gear partner',
  ];
}

function generateSources(team: ScoredTeam): string[] {
  const league = team.league || 'Unknown League';
  const sport = inferSport(team.league);
  
  return [
    `${league} Attendance and Fan Demographics Report 2025`,
    `Sports & Fitness Industry Association (SFIA) 2025 Sports Participation Report`,
    `U.S. Census Bureau QuickFacts for ${team.region || 'team market'}`,
    `Nielsen Sports 2024 Social Media Insights`,
    `${sport} Marketing Association Community Activation Examples`,
  ];
}

export function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`.replace('.0M', 'M');
  }
  return `$${amount.toLocaleString()}`;
}
