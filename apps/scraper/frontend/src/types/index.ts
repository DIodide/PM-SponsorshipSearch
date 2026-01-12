export interface ScraperInfo {
  id: string;
  name: string;
  description: string;
  source_url: string;
  status: 'idle' | 'running' | 'success' | 'failed';
  last_run: string | null;
  last_success: string | null;
  last_error: string | null;
  last_duration_ms: number;
  total_runs: number;
  successful_runs: number;
  last_teams_count: number;
}

// Sponsor information for a team
export interface SponsorInfo {
  name: string;
  category?: string;  // e.g., "Apparel", "Beverage", "Financial"
  asset_type?: string;  // e.g., "Jersey Patch", "Naming Rights", "Official Partner"
}

export interface TeamData {
  // Core fields (existing)
  name: string;
  region: string;
  league: string;
  target_demographic: string;
  official_url: string;
  category: string;
  sport_id?: number;
  team_id?: number;
  logo_url?: string;

  // Geographic (Phase 2)
  city_population?: number;
  metro_gdp_millions?: number;

  // Social/Audience (Phase 3)
  followers_x?: number;
  followers_instagram?: number;
  followers_facebook?: number;
  followers_tiktok?: number;
  subscribers_youtube?: number;
  avg_game_attendance?: number;

  // Family Friendliness (Phase 4)
  family_program_count?: number;
  family_program_types?: string[];

  // Inventory/Sponsors (Phase 5)
  owns_stadium?: boolean;
  stadium_name?: string;
  sponsors?: SponsorInfo[];

  // Pricing/Valuation (Phase 6)
  avg_ticket_price?: number;
  franchise_value_millions?: number;
  annual_revenue_millions?: number;

  // Brand Alignment (Phase 7)
  mission_tags?: string[];
  community_programs?: string[];
  cause_partnerships?: string[];

  // Enrichment Metadata
  enrichments_applied?: string[];
  last_enriched?: string;
}

export interface DataResponse {
  scraper_id: string;
  teams: TeamData[];
  count: number;
  last_updated: string | null;
}

export interface FileInfo {
  name: string;
  type: 'json' | 'xlsx';
  size: number;
  modified: string;
}

// Enrichment result from running an enricher
export interface EnrichmentResult {
  success: boolean;
  enricher_name: string;
  teams_processed: number;
  teams_enriched: number;
  duration_ms: number;
  timestamp: string;
  error?: string;
  details?: Record<string, unknown>;
}

// Available enrichers
export interface EnricherInfo {
  id: string;
  name: string;
  description: string;
  available: boolean;  // Whether the enricher can run (has required API keys, etc.)
  last_run?: string;
  status: 'idle' | 'running' | 'success' | 'failed';
}

// Metric group definitions for UI display
export interface MetricGroup {
  id: string;
  label: string;
  icon: string;
  fields: (keyof TeamData)[];
}

export const METRIC_GROUPS: MetricGroup[] = [
  {
    id: 'core',
    label: 'Core Information',
    icon: 'info',
    fields: ['name', 'region', 'league', 'category', 'target_demographic', 'official_url', 'logo_url'],
  },
  {
    id: 'geographic',
    label: 'Geographic Data',
    icon: 'map',
    fields: ['city_population', 'metro_gdp_millions'],
  },
  {
    id: 'social',
    label: 'Social & Audience',
    icon: 'users',
    fields: ['followers_x', 'followers_instagram', 'followers_facebook', 'followers_tiktok', 'subscribers_youtube', 'avg_game_attendance'],
  },
  {
    id: 'family',
    label: 'Family Friendliness',
    icon: 'heart',
    fields: ['family_program_count', 'family_program_types'],
  },
  {
    id: 'inventory',
    label: 'Inventory & Sponsors',
    icon: 'building',
    fields: ['owns_stadium', 'stadium_name', 'sponsors'],
  },
  {
    id: 'valuation',
    label: 'Pricing & Valuation',
    icon: 'dollar',
    fields: ['avg_ticket_price', 'franchise_value_millions', 'annual_revenue_millions'],
  },
  {
    id: 'brand',
    label: 'Brand Alignment',
    icon: 'tag',
    fields: ['mission_tags', 'community_programs', 'cause_partnerships'],
  },
];

// Field display metadata for formatting
export const FIELD_METADATA: Record<string, { label: string; format: 'number' | 'currency' | 'boolean' | 'text' | 'list' | 'tags' | 'sponsors' }> = {
  city_population: { label: 'City Population', format: 'number' },
  metro_gdp_millions: { label: 'Metro GDP (M)', format: 'currency' },
  followers_x: { label: 'X Followers', format: 'number' },
  followers_instagram: { label: 'Instagram Followers', format: 'number' },
  followers_facebook: { label: 'Facebook Followers', format: 'number' },
  followers_tiktok: { label: 'TikTok Followers', format: 'number' },
  subscribers_youtube: { label: 'YouTube Subscribers', format: 'number' },
  avg_game_attendance: { label: 'Avg. Attendance', format: 'number' },
  family_program_count: { label: 'Family Programs', format: 'number' },
  family_program_types: { label: 'Program Types', format: 'list' },
  owns_stadium: { label: 'Owns Stadium', format: 'boolean' },
  stadium_name: { label: 'Stadium Name', format: 'text' },
  sponsors: { label: 'Sponsors', format: 'sponsors' },
  avg_ticket_price: { label: 'Avg. Ticket Price', format: 'currency' },
  franchise_value_millions: { label: 'Franchise Value (M)', format: 'currency' },
  annual_revenue_millions: { label: 'Annual Revenue (M)', format: 'currency' },
  mission_tags: { label: 'Mission Tags', format: 'tags' },
  community_programs: { label: 'Community Programs', format: 'list' },
  cause_partnerships: { label: 'Cause Partnerships', format: 'list' },
};