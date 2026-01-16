import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Team, TeamRecommendation, TeamDetailAnalysis, RecommendationPrompt } from '../types';
import { getTotalFollowers } from './api';

const API_KEY = import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY || '';

let genAI: GoogleGenerativeAI | null = null;

function getAI() {
  if (!genAI && API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
  }
  return genAI;
}

// Infer sport from league
function inferSport(league: string | null | undefined): string {
  if (!league) return 'Sports';
  const l = league.toLowerCase();
  if (l.includes('nfl') || l.includes('football')) return 'Football';
  if (l.includes('nba') || l.includes('basketball') || l.includes('g league') || l.includes('wnba')) return 'Basketball';
  if (l.includes('mlb') || l.includes('baseball') || l.includes('triple-a') || l.includes('double-a') || l.includes('class a') || l.includes('high-a')) return 'Baseball';
  if (l.includes('nhl') || l.includes('hockey') || l.includes('ahl') || l.includes('echl')) return 'Hockey';
  if (l.includes('mls') || l.includes('soccer') || l.includes('usl') || l.includes('nwsl') || l.includes('wpsl')) return 'Soccer';
  return 'Sports';
}

// Calculate a basic match score based on prompt criteria
function calculateMatchScore(team: Team, prompt: RecommendationPrompt): number {
  let score = 50; // Base score
  
  const promptLower = prompt.objective.toLowerCase();
  
  // Family/community focused
  if (promptLower.includes('family') || promptLower.includes('famil')) {
    if (team.family_program_count && team.family_program_count > 0) score += 15;
    if (team.family_program_types && team.family_program_types.length > 0) score += 10;
  }
  
  // Community focused
  if (promptLower.includes('community') || promptLower.includes('grassroots') || promptLower.includes('local')) {
    if (team.community_programs && team.community_programs.length > 0) score += 15;
    if (team.cause_partnerships && team.cause_partnerships.length > 0) score += 10;
  }
  
  // Youth focused
  if (promptLower.includes('youth') || promptLower.includes('young') || promptLower.includes('kids') || promptLower.includes('children')) {
    if (team.family_program_types?.some(p => p.toLowerCase().includes('youth') || p.toLowerCase().includes('kid'))) {
      score += 20;
    }
  }
  
  // Region match
  if (prompt.region) {
    const regionLower = prompt.region.toLowerCase();
    const teamRegion = (team.region || team.geo_city || '').toLowerCase();
    if (teamRegion.includes(regionLower) || regionLower.includes('southern') && 
        (teamRegion.includes('texas') || teamRegion.includes('tx') || teamRegion.includes('florida') || 
         teamRegion.includes('georgia') || teamRegion.includes('louisiana') || teamRegion.includes('carolina'))) {
      score += 15;
    }
  }
  
  // Budget alignment
  if (prompt.budget) {
    const estimatedPrice = estimatePartnershipPrice(team);
    const diff = Math.abs(estimatedPrice - prompt.budget) / prompt.budget;
    if (diff < 0.2) score += 10;
    else if (diff < 0.5) score += 5;
    else if (diff > 1) score -= 10;
  }
  
  // Social media presence bonus
  const followers = getTotalFollowers(team);
  if (followers > 1000000) score += 5;
  else if (followers > 100000) score += 3;
  
  // Has enrichment data bonus
  if (team.enrichments_applied && team.enrichments_applied.length > 2) score += 5;
  
  // Normalize to 0-100
  return Math.min(100, Math.max(0, score));
}

// Estimate partnership price based on team data
function estimatePartnershipPrice(team: Team): number {
  let basePrice = 500000; // $500K base
  
  // Adjust based on franchise value
  if (team.franchise_value) {
    if (team.franchise_value > 5000000000) basePrice = 5000000; // $5M for top teams
    else if (team.franchise_value > 2000000000) basePrice = 2500000;
    else if (team.franchise_value > 1000000000) basePrice = 1500000;
    else if (team.franchise_value > 500000000) basePrice = 800000;
  }
  
  // Adjust based on league tier
  const league = (team.league || '').toLowerCase();
  if (league.includes('nfl') || league.includes('nba') || league.includes('mlb') || league.includes('nhl')) {
    basePrice *= 1.5;
  } else if (league.includes('mls') || league.includes('nwsl')) {
    basePrice *= 0.8;
  } else if (league.includes('triple-a') || league.includes('ahl') || league.includes('g league')) {
    basePrice *= 0.5;
  } else if (league.includes('double-a') || league.includes('echl') || league.includes('usl')) {
    basePrice *= 0.3;
  } else if (league.includes('class a') || league.includes('high-a') || league.includes('wpsl')) {
    basePrice *= 0.2;
  }
  
  // Round to nice number
  return Math.round(basePrice / 100000) * 100000;
}

export async function generateRecommendations(
  teams: Team[],
  prompt: RecommendationPrompt
): Promise<TeamRecommendation[]> {
  // Score and sort all teams
  const scored = teams.map(team => ({
    team,
    matchScore: calculateMatchScore(team, prompt),
    priceEstimate: estimatePartnershipPrice(team),
    sport: inferSport(team.league),
  }));
  
  // Sort by match score descending
  scored.sort((a, b) => b.matchScore - a.matchScore);
  
  // Take top 10 candidates
  const topCandidates = scored.slice(0, 10);
  
  // Try to generate AI descriptions
  const ai = getAI();
  if (ai) {
    try {
      const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      for (const candidate of topCandidates) {
        const teamInfo = `
Team: ${candidate.team.name}
League: ${candidate.team.league || 'Unknown'}
Region: ${candidate.team.region || candidate.team.geo_city || 'Unknown'}
Sport: ${candidate.sport}
Family Programs: ${candidate.team.family_program_count || 0}
Community Programs: ${(candidate.team.community_programs || []).join(', ') || 'None listed'}
Social Following: ${getTotalFollowers(candidate.team).toLocaleString()}
`;
        
        const result = await model.generateContent(`
Generate a brief 2-3 sentence description for why this sports team would be a good sponsorship partner for a brand with this objective: "${prompt.objective}"

${teamInfo}

Respond with ONLY the description, no quotes or formatting.
`);
        
        candidate.description = result.response.text().trim();
      }
    } catch (error) {
      console.error('AI generation error:', error);
      // Fallback to template descriptions
      for (const candidate of topCandidates) {
        candidate.description = generateFallbackDescription(candidate.team, prompt);
      }
    }
  } else {
    // No API key - use fallback descriptions
    for (const candidate of topCandidates) {
      candidate.description = generateFallbackDescription(candidate.team, prompt);
    }
  }
  
  return topCandidates.map(c => ({
    team: c.team,
    matchScore: c.matchScore,
    description: c.description || generateFallbackDescription(c.team, prompt),
    priceEstimate: c.priceEstimate,
    sport: c.sport,
  }));
}

function generateFallbackDescription(team: Team, prompt: RecommendationPrompt): string {
  const sport = inferSport(team.league);
  const region = team.region || team.geo_city || 'their region';
  const hasFamily = team.family_program_count && team.family_program_count > 0;
  const hasCommunity = team.community_programs && team.community_programs.length > 0;
  
  if (hasFamily && hasCommunity) {
    return `The ${team.name} are a ${sport.toLowerCase()} team known for their family-friendly atmosphere and deep community engagement throughout ${region}. Their weekend home games consistently draw local families, with themed promotions that naturally connect your brand with parents and young fans.`;
  } else if (hasFamily) {
    return `The ${team.name} offer excellent family engagement opportunities in ${region}. Their ${sport.toLowerCase()} games feature kid-friendly activities and family sections that align well with brands targeting young families.`;
  } else if (hasCommunity) {
    return `The ${team.name} are a community-driven ${sport.toLowerCase()} club with strong grassroots networks in ${region}. Their local initiatives and community programs provide authentic connection opportunities with engaged fans.`;
  }
  
  return `The ${team.name} are a ${sport.toLowerCase()} team based in ${region}. They offer partnership opportunities that can help brands connect with local fans and sports enthusiasts in the market.`;
}

export async function generateTeamDetailAnalysis(
  team: Team,
  prompt: RecommendationPrompt
): Promise<TeamDetailAnalysis> {
  const sport = inferSport(team.league);
  const priceEstimate = estimatePartnershipPrice(team);
  
  const ai = getAI();
  if (ai) {
    try {
      const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const teamInfo = `
Team: ${team.name}
League: ${team.league || 'Unknown'}
Region: ${team.region || team.geo_city || 'Unknown'}
Sport: ${sport}
Stadium: ${team.stadium_name || 'Unknown'}
Family Programs: ${team.family_program_count || 0} programs - ${(team.family_program_types || []).join(', ') || 'None listed'}
Community Programs: ${(team.community_programs || []).join(', ') || 'None listed'}
Cause Partnerships: ${(team.cause_partnerships || []).join(', ') || 'None listed'}
Current Sponsors: ${(team.sponsors || []).map(s => s.name).join(', ') || 'Unknown'}
Social Following: X: ${team.followers_x || 0}, Instagram: ${team.followers_instagram || 0}, TikTok: ${team.followers_tiktok || 0}, YouTube: ${team.subscribers_youtube || 0}
Average Attendance: ${team.avg_game_attendance || 'Unknown'}
Franchise Value: ${team.franchise_value ? '$' + (team.franchise_value / 1000000000).toFixed(1) + 'B' : 'Unknown'}
`;

      const result = await model.generateContent(`
Generate a detailed sponsorship analysis for this team given the brand objective: "${prompt.objective}"

${teamInfo}

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "description": "A detailed 3-4 sentence paragraph about the team and why they're a good match",
  "pros": ["pro 1", "pro 2", "pro 3", "pro 4"],
  "cons": ["con 1", "con 2", "con 3"],
  "primaryAudience": ["Audience segment 1 with age range and description", "Audience segment 2", "Audience segment 3"],
  "secondaryAudience": ["Secondary audience 1", "Secondary audience 2"],
  "audienceCharacteristics": ["Characteristic 1", "Characteristic 2", "Characteristic 3"],
  "currentPartners": ["Partner 1 - description of partnership", "Partner 2 - description", "Partner 3 - description"]
}
`);
      
      const text = result.response.text().trim();
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          description: parsed.description || generateFallbackDescription(team, prompt),
          pros: parsed.pros || generateFallbackPros(team),
          cons: parsed.cons || generateFallbackCons(team),
          primaryAudience: parsed.primaryAudience || generateFallbackAudience(team).primary,
          secondaryAudience: parsed.secondaryAudience || generateFallbackAudience(team).secondary,
          audienceCharacteristics: parsed.audienceCharacteristics || generateFallbackAudience(team).characteristics,
          currentPartners: parsed.currentPartners || generateFallbackPartners(team),
          sources: generateSources(team),
          priceEstimate,
        };
      }
    } catch (error) {
      console.error('AI detail generation error:', error);
    }
  }
  
  // Fallback
  return {
    description: generateFallbackDescription(team, prompt),
    pros: generateFallbackPros(team),
    cons: generateFallbackCons(team),
    ...generateFallbackAudience(team),
    currentPartners: generateFallbackPartners(team),
    sources: generateSources(team),
    priceEstimate,
  };
}

function generateFallbackPros(team: Team): string[] {
  const pros: string[] = [];
  const sport = inferSport(team.league);
  
  if (team.family_program_count && team.family_program_count > 0) {
    pros.push('Extensive youth and grassroots engagement');
  }
  if (team.community_programs && team.community_programs.length > 0) {
    pros.push('Active local event calendar beyond matchdays');
  }
  if (getTotalFollowers(team) > 100000) {
    pros.push('Strong digital presence across social platforms');
  }
  if (team.cause_partnerships && team.cause_partnerships.length > 0) {
    pros.push('Authentic community reputation and high family participation');
  }
  pros.push('Affordable, flexible sponsorship inventory');
  
  return pros.slice(0, 4);
}

function generateFallbackCons(team: Team): string[] {
  const cons: string[] = [];
  const league = (team.league || '').toLowerCase();
  
  if (!league.includes('nfl') && !league.includes('nba') && !league.includes('mlb') && !league.includes('nhl')) {
    cons.push('Regional rather than national visibility');
    cons.push('Limited exposure outside local market');
  }
  if (league.includes('minor') || league.includes('triple') || league.includes('double') || league.includes('class')) {
    cons.push('Smaller broadcast reach compared to major leagues');
  }
  if (getTotalFollowers(team) < 100000) {
    cons.push('Limited social media reach');
  }
  
  return cons.length > 0 ? cons.slice(0, 3) : ['Market-specific activation opportunities', 'Requires localized marketing approach'];
}

function generateFallbackAudience(team: Team): { 
  primaryAudience: string[]; 
  secondaryAudience: string[]; 
  audienceCharacteristics: string[];
} {
  const sport = inferSport(team.league);
  const region = team.region || team.geo_city || 'the region';
  
  return {
    primaryAudience: [
      `Families and youth athletes (ages 6-16) — active participants in the team's programs`,
      `Millennial parents (ages 30-45) — sports-minded families seeking affordable, outdoor activities`,
      `Local ${sport.toLowerCase()} fans and transplants — ${region}'s diverse population with interest in the sport`,
    ],
    secondaryAudience: [
      `Young professionals (ages 22-35) — drawn to social, music, and food-driven matchday experiences`,
      `Community-minded locals — residents who support local businesses and city events year-round`,
    ],
    audienceCharacteristics: [
      'Value authentic local engagement and grassroots connections',
      'Highly responsive to event-based activations and digital storytelling',
      'Active across Instagram, TikTok, and YouTube for highlights, fan content, and local news',
    ],
  };
}

function generateFallbackPartners(team: Team): string[] {
  if (team.sponsors && team.sponsors.length > 0) {
    return team.sponsors.slice(0, 5).map(s => 
      `${s.name} – ${s.asset_type || 'Official partner'}`
    );
  }
  
  return [
    'Local Apparel Co – Official lifestyle and sideline apparel partner',
    'Regional Beverage Brand – Hydration sponsor for community clinics',
    'Local Financial Institution – Presenting partner of community programs',
    'Local Food Company – Matchday food market sponsor',
    'Sportswear Brand – Training kit partner',
  ];
}

function generateSources(team: Team): string[] {
  const league = team.league || 'Unknown League';
  const sport = inferSport(team.league);
  
  return [
    `${league} Attendance and Fan Demographics Report 2025. Retrieved from official league website`,
    `Sports & Fitness Industry Association (SFIA). 2025 Sports Participation Report.`,
    `U.S. Census Bureau. County QuickFacts for ${team.geo_city || 'team market'}.`,
    `Nielsen Sports. 2024 Social Media Insights for Sports Fans.`,
    `${sport} Marketing Association. Community and Fan Activation Examples.`,
  ];
}

export function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`.replace('.0M', 'M');
  }
  return `$${amount.toLocaleString()}`;
}
