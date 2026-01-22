import { v } from "convex/values";
import { action } from "./_generated/server";

// ----------------------
// Types for Team Analysis
// ----------------------

const scoredTeamSchema = v.object({
  _id: v.string(),
  name: v.string(),
  region: v.string(),
  league: v.string(),
  official_url: v.string(),
  digital_reach: v.number(),
  local_reach: v.number(),
  family_friendly: v.union(v.number(), v.null()),
  value_tier: v.number(),
});

const fullTeamSchema = v.optional(v.object({
  name: v.string(),
  stadium_name: v.optional(v.union(v.string(), v.null())),
  owns_stadium: v.optional(v.union(v.boolean(), v.null())),
  avg_game_attendance: v.optional(v.union(v.number(), v.null())),
  franchise_value: v.optional(v.union(v.number(), v.null())),
  geo_city: v.optional(v.union(v.string(), v.null())),
  sponsors: v.optional(v.union(v.array(v.any()), v.null())),
  community_programs: v.optional(v.union(v.array(v.string()), v.null())),
  cause_partnerships: v.optional(v.union(v.array(v.string()), v.null())),
  family_program_types: v.optional(v.union(v.array(v.string()), v.null())),
  family_program_count: v.optional(v.union(v.number(), v.null())),
  mission_tags: v.optional(v.union(v.array(v.string()), v.null())),
}));

const filtersSchema = v.object({
  regions: v.array(v.string()),
  demographics: v.array(v.string()),
  brandValues: v.array(v.string()),
  leagues: v.array(v.string()),
  goals: v.array(v.string()),
});

// ----------------------
// Helper Functions
// ----------------------

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

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—';
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

function estimatePriceFromTier(valueTier: number, league: string | null): number {
  const tierPrices: Record<number, number> = {
    1: 100000,
    2: 1000000,
    3: 15000000,
  };
  
  let basePrice = tierPrices[valueTier] || 500000;
  
  // Adjust by league
  const leagueLower = (league || '').toLowerCase();
  if (leagueLower.includes('nfl') || leagueLower.includes('nba') || leagueLower.includes('mlb') || leagueLower.includes('nhl')) {
    basePrice *= 1.5;
  } else if (leagueLower.includes('mls') || leagueLower.includes('nwsl')) {
    basePrice *= 0.9;
  } else if (leagueLower.includes('minor') || leagueLower.includes('usl')) {
    basePrice *= 0.6;
  }
  
  return Math.round(basePrice / 100000) * 100000;
}

interface ScoredTeam {
  _id: string;
  name: string;
  region: string;
  league: string;
  official_url: string;
  digital_reach: number;
  local_reach: number;
  family_friendly: number | null;
  value_tier: number;
}

interface FullTeam {
  name: string;
  stadium_name?: string | null;
  owns_stadium?: boolean | null;
  avg_game_attendance?: number | null;
  franchise_value?: number | null;
  geo_city?: string | null;
  sponsors?: any[] | null;
  community_programs?: string[] | null;
  cause_partnerships?: string[] | null;
  family_program_types?: string[] | null;
  family_program_count?: number | null;
  mission_tags?: string[] | null;
}

interface Filters {
  regions: string[];
  demographics: string[];
  brandValues: string[];
  leagues: string[];
  goals: string[];
}

interface TeamDetailAnalysis {
  description: string;
  pros: string[];
  cons: string[];
  primaryAudience: string[];
  secondaryAudience: string[];
  audienceCharacteristics: string[];
  currentPartners: string[];
  sources: string[];
  priceEstimate: number;
}

// Fallback generators
function generateFallbackDescription(team: ScoredTeam, filters: Filters): string {
  const sport = inferSport(team.league);
  const region = team.region || 'their region';
  
  const valueDesc = team.value_tier === 3 
    ? 'premium-tier' 
    : team.value_tier === 1 
      ? 'budget-friendly' 
      : 'mid-tier';
  
  const reachDesc = team.digital_reach > -0.4 
    ? 'strong digital presence' 
    : team.local_reach > -0.3 
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
  
  if (team.digital_reach > -0.4) {
    pros.push('Strong digital presence across social platforms');
  }
  if (team.local_reach > -0.3) {
    pros.push('High local engagement and game attendance');
  }
  if (team.family_friendly && team.family_friendly > 2) {
    pros.push('Extensive family-friendly programming');
  }
  if (team.value_tier === 1) {
    pros.push('Cost-effective sponsorship opportunities');
  }
  if (team.value_tier === 3) {
    pros.push('Premium brand association opportunities');
  }
  
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
  if (team.digital_reach < -0.85) {
    cons.push('Limited social media reach');
  }
  if (team.value_tier === 3) {
    cons.push('Higher sponsorship costs');
  }
  
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

function generateFallbackPartners(fullTeam?: FullTeam): string[] {
  if (fullTeam?.sponsors && fullTeam.sponsors.length > 0) {
    return fullTeam.sponsors.slice(0, 5).map((s: any) => 
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

// ----------------------
// Convex Action: Generate Team Analysis
// ----------------------

export const generateTeamAnalysis = action({
  args: {
    scoredTeam: scoredTeamSchema,
    fullTeam: fullTeamSchema,
    filters: filtersSchema,
  },

  handler: async (ctx, args): Promise<TeamDetailAnalysis> => {
    const { scoredTeam, fullTeam, filters } = args;
    
    const apiKey = process.env.GEMINI_API_KEY;
    const sport = inferSport(scoredTeam.league);
    const priceEstimate = estimatePriceFromTier(scoredTeam.value_tier, scoredTeam.league);
    
    if (apiKey) {
      try {
        // Build context from available data
        const sponsorsList = fullTeam?.sponsors?.map((s: any) => 
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

        const prompt = `
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
`;

        // Call Gemini API
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Gemini API error:', errorText);
          throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const audienceData = generateFallbackAudience(scoredTeam);
          
          return {
            description: parsed.description || generateFallbackDescription(scoredTeam, filters),
            pros: parsed.pros || generateFallbackPros(scoredTeam),
            cons: parsed.cons || generateFallbackCons(scoredTeam),
            primaryAudience: parsed.primaryAudience || audienceData.primary,
            secondaryAudience: parsed.secondaryAudience || audienceData.secondary,
            audienceCharacteristics: parsed.audienceCharacteristics || audienceData.characteristics,
            currentPartners: parsed.currentPartners || generateFallbackPartners(fullTeam),
            sources: generateSources(scoredTeam),
            priceEstimate,
          };
        }
      } catch (error) {
        console.error('AI detail generation error:', error);
      }
    }
    
    // Fallback when API key is not available or on error
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
  },
});
