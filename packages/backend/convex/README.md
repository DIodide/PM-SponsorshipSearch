# PlayMaker Sponsorship Search — Convex Backend

The serverless backend powering the PlayMaker Sponsorship Search platform. Built on Convex for real-time data, serverless functions, and seamless scaling.

---

## Overview

This Convex backend handles:

- **Data Storage**: 500+ team records with rich metadata
- **Similarity Scoring**: Embedding-based brand-to-team matching
- **AI Operations**: Team analysis and campaign generation via Gemini
- **Data Import**: Batch import from scraper system

---

## Schema

### Tables

#### `All_Teams`
Raw team data imported from scrapers. Contains the full dataset with all fields.

```typescript
All_Teams {
  name: string;                    // Required - team name
  region?: string;                 // Geographic region
  league?: string;                 // League name
  target_demographic?: string;     // Audience description
  official_url?: string;           // Team website
  category?: string;               // Team category
  logo_url?: string;
  
  // Geographic
  geo_city?: string;
  geo_country?: string;
  city_population?: number;
  metro_gdp?: number;              // Raw value in dollars
  
  // Social Media
  social_handles?: Array<{platform, handle, url, unique_id}>;
  followers_x?: number;
  followers_instagram?: number;
  followers_facebook?: number;
  followers_tiktok?: number;
  subscribers_youtube?: number;
  
  // Programs & Stadium
  family_program_count?: number;
  family_program_types?: string[];
  owns_stadium?: boolean;
  stadium_name?: string;
  sponsors?: any;
  
  // Valuation
  avg_ticket_price?: number;
  franchise_value?: number;        // Raw value in dollars
  annual_revenue?: number;         // Raw value in dollars
  
  // Brand & CSR
  mission_tags?: string[];
  community_programs?: string[];
  cause_partnerships?: string[];
  
  // Metadata
  enrichments_applied?: string[];
  last_enriched?: string;
  sources?: Array<{url, source_type, source_name, ...}>;
  field_sources?: any;
  scraped_at?: string;
  scraper_version?: string;
}
```

#### `All_Teams_Clean`
Preprocessed team data with embeddings for similarity search.

```typescript
All_Teams_Clean {
  name: string;
  region: string;
  league: string;
  category?: string;
  official_url: string;
  
  // Embeddings (768-dimensional vectors)
  region_embedding: float64[] | null;
  league_embedding: float64[] | null;
  values_embedding: float64[] | null;
  sponsors_embedding: float64[] | null;
  family_programs_embedding: float64[] | null;
  community_programs_embedding: float64[] | null;
  partners_embedding: float64[] | null;
  
  // Computed Scores (0-1 scale)
  digital_reach: number | null;     // Based on social followers
  local_reach: number | null;       // Based on attendance + population
  family_friendly: number | null;   // Based on family programs
  value_tier: number;               // 1=budget, 2=mid, 3=premium
  
  // Demographic Weights
  women_weight?: number;
  men_weight?: number;
  gen_z_weight?: number;
  millenial_weight?: number;
  gen_x_weight?: number;
  boomer_weight?: number;
  kids_weight?: number;
  stadium_ownership?: boolean;
}
```

#### Other Tables

| Table | Purpose |
|-------|---------|
| `teams` | Legacy team data (deprecated) |
| `searchSessions` | User query tracking |
| `searchResults` | Session-team result links |
| `researchCache` | AI discovery cache |
| `socialUpdateQueue` | Social media update jobs |
| `tableCounts` | Efficient document counts |
| `NFL_seed` / `NFL_seed_clean` | Initial NFL seed data |

---

## Key Modules

### `similarityScoring.ts`

**Purpose:** Compute brand-to-team similarity using embeddings

**Main Action:** `computeBrandSimilarity`

```typescript
// Input
{
  query: string;               // Brand description
  filters: {
    regions: string[];         // Target regions
    demographics: string[];    // Target demographics
    brandValues: string[];     // Brand values
    leagues: string[];         // League filters
    goals: string[];           // Partnership goals
    budgetMin?: number;
    budgetMax?: number;
  };
  page?: number;               // Page number (1-indexed)
  pageSize?: number;           // Results per page
}

// Output
{
  teams: ScoredTeam[];         // Teams with similarity_score
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

**Scoring Algorithm:**

1. **Embed Brand Criteria**: Generate 6 embeddings for region, league, values, audience, goals, and query
2. **Compute Cosine Similarity**: Compare brand embeddings against team embeddings
3. **Apply Multi-Factor Scoring**:
   - Region similarity: 30%
   - Value tier match: 30%
   - Demographics match: 30%
   - Query similarity: 4%
   - Values similarity: 2%
   - Reach score: 4%
4. **Filter & Sort**: Remove zero-score teams, sort descending
5. **Paginate**: Return requested page

### `teamAnalysis.ts`

**Purpose:** Generate AI-powered team analysis

**Main Action:** `generateTeamAnalysis`

Returns:
- Partnership strengths
- Potential challenges
- Activation ideas
- Audience alignment insights

### `campaignGeneration.ts`

**Purpose:** Generate AI sponsorship campaigns

**Main Action:** `generateCampaign`

```typescript
// Input
{
  teamId: string;
  teamName: string;
  teamLeague: string;
  teamRegion: string;
  mediaStrategy: string;
  touchpoints: string[];
  notes?: string;
  uploadedImageUrls?: string[];
  generateVisuals?: boolean;
}

// Output
{
  title: string;
  executiveSummary: string;
  touchpointActivations: Array<{
    touchpoint: string;
    title: string;
    description: string;
    estimatedReach?: string;
  }>;
  creativeConceptIdeas: string[];
  visualMockups?: string[];
}
```

**Visual Generation:** Uses Gemini Imagen 3 for creating campaign mockups

### `scraperImport.ts`

**Purpose:** Import team data from scrapers

**Key Mutations:**
- `clearAllTeams`: Clear All_Teams table
- `batchImportTeams`: Batch insert teams
- `getAllTeamsCount`: Get team count

### `dataPreProcess.ts` / `dataPreProcessFull.ts`

**Purpose:** Preprocess teams for search

**Process:**
1. Load teams from `All_Teams`
2. Generate embeddings for text fields
3. Compute normalized scores
4. Calculate demographic weights
5. Store in `All_Teams_Clean`

### `All_Teams_Clean.ts`

**Purpose:** Queries for preprocessed team data

**Key Functions:**
- `getPage`: Paginated fetch with embeddings
- `getAll`: Fetch all teams
- `getCount`: Get total count
- `stripEmbeddings`: Remove embeddings for client response

---

## Environment Variables

Set in Convex Dashboard → Settings → Environment Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI API key for embeddings |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | Gemini API key for text/image generation |

---

## Development

### Running Locally

```bash
cd packages/backend

# Login to Convex
npx convex login

# Start dev server
npx convex dev
```

### Deploying

```bash
# Deploy to production
npx convex deploy
```

### Testing Functions

Use the Convex Dashboard → Functions panel to test queries and mutations.

Example: Test similarity scoring:

```javascript
// In Dashboard Functions panel
await ctx.runAction(api.similarityScoring.computeBrandSimilarity, {
  query: "Regional beverage company",
  filters: {
    regions: ["midwest"],
    demographics: ["families"],
    brandValues: ["community"],
    leagues: ["MLB MiLB"],
    goals: ["local-presence"],
  },
  page: 1,
  pageSize: 10,
});
```

---

## Data Flow

### Import Flow

```
Scraper JSON
    ↓
POST /api/convex/export-all
    ↓
scraperImport:batchImportTeams
    ↓
All_Teams table
    ↓
dataPreProcess:preprocessAllTeams
    ↓
All_Teams_Clean table (with embeddings)
```

### Search Flow

```
Brand Criteria (UI)
    ↓
similarityScoring:computeBrandSimilarity
    ↓
1. Embed criteria with Gemini
2. Load teams from All_Teams_Clean
3. Compute cosine similarity
4. Apply multi-factor scoring
5. Filter & sort
6. Return paginated results
    ↓
UI displays ranked teams
```

### Analysis Flow

```
Team Detail View
    ↓
teamAnalysis:generateTeamAnalysis
    ↓
1. Prepare team context
2. Call Gemini with prompt
3. Parse structured response
    ↓
UI displays AI analysis
```

---

## HTTP Endpoints

The Convex HTTP router exposes endpoints for SSE streaming (defined in `http.ts`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/search` | POST | SSE streaming search (legacy) |

---

## Performance Considerations

### Embedding Storage

- Embeddings are 768-dimensional float64 arrays
- ~6KB per team for all embeddings
- Total ~3MB for 500 teams

### Query Performance

- `All_Teams_Clean` fits in memory during action
- Pagination reduces client payload
- Cosine similarity computed in-memory (fast)

### Scaling Notes

- Convex handles automatic scaling
- Actions have 10-minute timeout
- Large imports should use batching

---

## Related Documentation

- [Main README](../../../README.md) - Project overview
- [Teams Browser](../../../apps/teamsbrowser/README.md) - Frontend UI
- [Scraper](../../../apps/scraper/README.md) - Data collection
- [Convex Docs](https://docs.convex.dev/) - Convex documentation
