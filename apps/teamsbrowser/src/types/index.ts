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

// AI Recommendation types
export interface RecommendationPrompt {
  objective: string;
  budget?: number;
  region?: string;
}

export interface TeamRecommendation {
  team: Team;
  matchScore: number;
  description: string;
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

export interface FilterState {
  search: string;
  leagues: string[];
  minValuation?: number;
  maxValuation?: number;
  hasSocialData: boolean | null;
  hasGeoData: boolean | null;
  sortBy: 'name' | 'valuation' | 'followers' | 'attendance';
  sortOrder: 'asc' | 'desc';
}

export const LEAGUES = [
  'NFL', 'NBA', 'MLB', 'NHL', 'MLS',
  'G League', 'WNBA', 'Minor League Baseball',
  'AHL', 'ECHL', 'USL Championship', 'NWSL'
];

export const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'valuation', label: 'Franchise Value' },
  { value: 'followers', label: 'Social Following' },
  { value: 'attendance', label: 'Attendance' },
] as const;

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
