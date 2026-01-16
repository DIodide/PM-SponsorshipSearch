// Filter options
export const REGIONS = [
  { value: "northeast", label: "Northeast" },
  { value: "southeast", label: "Southeast" },
  { value: "midwest", label: "Midwest" },
  { value: "southwest", label: "Southwest" },
  { value: "west", label: "West" },
];

export const DEMOGRAPHICS = [
  { value: "families", label: "Families" },
  { value: "young-professionals", label: "Young Professionals" },
  { value: "millennials", label: "Millennials" },
  { value: "gen-z", label: "Gen Z" },
  { value: "affluent", label: "Affluent" },
  { value: "sports-enthusiasts", label: "Sports Enthusiasts" },
];

export const BRAND_VALUES = [
  { value: "community", label: "Community" },
  { value: "performance", label: "Performance" },
  { value: "innovation", label: "Innovation" },
  { value: "tradition", label: "Tradition" },
  { value: "wellness", label: "Wellness" },
  { value: "sustainability", label: "Sustainability" },
  { value: "excellence", label: "Excellence" },
  { value: "family", label: "Family-Friendly" },
];

export const LEAGUES = [
  { value: "NFL", label: "NFL" },
  { value: "NBA", label: "NBA" },
  { value: "MLB", label: "MLB" },
  { value: "NHL", label: "NHL" },
  { value: "MLS", label: "MLS" },
  { value: "WNBA", label: "WNBA" },
  { value: "USL", label: "USL" },
  { value: "Minor League", label: "Minor League" },
];

export const GOALS = [
  { value: "awareness", label: "Brand Awareness" },
  { value: "trial", label: "Product Trial" },
  { value: "loyalty", label: "Customer Loyalty" },
  { value: "b2b", label: "B2B Relationships" },
  { value: "employer-brand", label: "Employer Brand" },
  { value: "local-presence", label: "Local Presence" },
];

// Search filters matching similarityScoring.ts requirements
export interface SearchFilters {
  regions: string[];
  demographics: string[];
  brandValues: string[];
  leagues: string[];
  goals: string[];
  budgetMin?: number;
  budgetMax?: number;
}

// AllTeamsClean type from Convex
export interface AllTeamsClean {
  _id: string;
  name: string;
  region: string;
  league: string;
  official_url: string;
  region_embedding: number[] | null;
  league_embedding: number[] | null;
  values_embedding: number[] | null;
  sponsors_embedding: number[] | null;
  family_programs_embedding: number[] | null;
  community_programs_embedding: number[] | null;
  partners_embedding: number[] | null;
  digital_reach: number;
  local_reach: number;
  family_friendly: number | null;
  value_tier: number; // 1 = budget-friendly, 2 = mid-tier, 3 = premium
}

// Team with similarity score
export interface ScoredTeam extends AllTeamsClean {
  similarity_score: number;
}

// Team data from All_Teams (for additional info display)
export interface SocialHandle {
  platform: string;
  handle: string;
  url?: string;
  unique_id?: string;
}

export interface SponsorInfo {
  name: string;
  category?: string;
  asset_type?: string;
}

export interface Team {
  _id: string;
  _creationTime: number;
  
  // Core fields
  name: string;
  region?: string | null;
  league?: string | null;
  target_demographic?: string | null;
  official_url?: string | null;
  category?: string | null;
  logo_url?: string | null;

  // Geographic
  geo_city?: string | null;
  geo_country?: string | null;
  city_population?: number | null;
  metro_gdp?: number | null;

  // Social media
  social_handles?: SocialHandle[] | null;
  followers_x?: number | null;
  followers_instagram?: number | null;
  followers_facebook?: number | null;
  followers_tiktok?: number | null;
  subscribers_youtube?: number | null;
  avg_game_attendance?: number | null;

  // Family friendliness
  family_program_count?: number | null;
  family_program_types?: string[] | null;

  // Inventory/Sponsors
  owns_stadium?: boolean | null;
  stadium_name?: string | null;
  sponsors?: SponsorInfo[] | null;

  // Valuation
  avg_ticket_price?: number | null;
  franchise_value?: number | null;
  annual_revenue?: number | null;

  // Brand alignment
  mission_tags?: string[] | null;
  community_programs?: string[] | null;
  cause_partnerships?: string[] | null;

  // Metadata
  enrichments_applied?: string[] | null;
  last_enriched?: string | null;
}

// Combined result for display
export interface TeamRecommendation {
  scoredTeam: ScoredTeam;
  fullTeam?: Team; // Optional additional data from All_Teams
  matchPercent: number;
  priceEstimate: number;
  sport: string;
}

export interface TeamDetailAnalysis {
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

// Navigation items
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

export const NAV_SECTIONS = {
  activate: {
    label: 'Activate',
    items: [
      { id: 'partnerships', label: 'Partnerships', badge: 4 },
      { id: 'approvals', label: 'Approvals' },
      { id: 'schedule', label: 'Schedule', isBeta: true },
      { id: 'payments', label: 'Payments' },
      { id: 'executive', label: 'Executive Overview' },
      { id: 'ask', label: 'Ask PlayMaker' },
    ],
  },
  accounts: {
    label: 'Accounts',
    items: [
      { id: 'accounts', label: 'Accounts' },
    ],
  },
  sales: {
    label: 'Sales',
    items: [
      { id: 'pipeline', label: 'Deal Pipeline', badge: 9 },
      { id: 'inventory', label: 'Inventory' },
      { id: 'forecast', label: 'Forecast' },
    ],
  },
};
