// Filter options
export const REGIONS = [
  { value: "united states northeast", label: "Northeast" },
  { value: "united states southeast", label: "Southeast" },
  { value: "united states midwest", label: "Midwest" },
  { value: "united states southwest", label: "Southwest" },
  { value: "united states west", label: "West" },
];

export const DEMOGRAPHICS = [
  { value: "gen-z", label: "Gen Z" },
  { value: "millennials", label: "Millennials" },
  { value: "gen-x", label: "Gen X" },
  { value: "boomer", label: "Boomer" },
  { value: "families", label: "Families" },
  { value: "kids", label: "Kids" },
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "people-of-color", label: "People of Color" },
  { value: "businesses", label: "Businesses" },
];

export const BRAND_VALUES = [
  { value: "community", label: "Community" },
  { value: "performance", label: "Performance" },
  { value: "innovation", label: "Innovation" },
  { value: "wellness", label: "Wellness" },
  { value: "sustainability", label: "Sustainability" },
  { value: "family", label: "Family-Friendly" },
];

// YUBI: change from leagues to sports
export const LEAGUES = [
 { value: "NFL", label: "Football" },
 { value: "NBA G League", label: "Basketball" },
 { value: "Major League Baseball Triple-A Single-A High-A Double-A Rookie", label: "Baseball" },
 { value: "NHL ECHL AHL", label: "Hockey" },
 { value: "MLS", label: "Soccer" }
];

export const GOALS = [
  { value: "local-presence", label: "Local Presence" },
  { value: "digital-presence", label: "Digital Presence" },
  { value: "brand-awareness", label: "Brand Awareness" },
  { value: "product-promotion", label: "Product Promotion" },
  { value: "business-to-business", label: "B2B Relationships" },
  { value: "fan-connection-activation-control", label: "Deep Fan Connection and Activation Control" },
  { value: "prestige-credibility", label: "Prestige and Credibility" },
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

// Source citation from the scraper
export interface SourceCitation {
  url: string;
  source_type: string; // "api", "website", "database", "cached", "static"
  source_name: string; // Human-readable name: "MLB StatsAPI", "WikiData SPARQL", etc.
  retrieved_at?: string;
  title?: string;
  domain?: string;
  api_endpoint?: string;
  query_params?: Record<string, string>;
  fields_sourced?: string[];
  is_primary?: boolean;
  confidence?: number;
  cache_hit?: boolean;
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

  // Source/Citation Tracking
  sources?: SourceCitation[] | null;
  field_sources?: Record<string, string[]> | null;
  scraped_at?: string | null;
  scraper_version?: string | null;
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
