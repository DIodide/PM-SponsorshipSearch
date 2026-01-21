# Teams Browser — PlayMaker Sponsorship Search UI

The primary user-facing application for discovering sports sponsorship opportunities through AI-powered semantic similarity matching.

---

## Overview

Teams Browser is a React + Vite application that provides brands with an intelligent search interface to find optimal team partnership opportunities. It uses embedding-based similarity scoring to match brand criteria against a database of 500+ professional and minor league sports teams.

### Key Features

- **Semantic Search**: Input brand criteria (region, demographics, values, goals) and find the best-matching teams
- **Multi-factor Scoring**: Combines cosine similarity on embeddings with demographic matching and value tier alignment
- **Paginated Results**: Efficient pagination with prefetching for instant page transitions
- **Team Detail Views**: Comprehensive team profiles with AI-generated analysis
- **Campaign Generator**: Create AI-powered sponsorship campaigns with visual assets
- **League Filtering**: Focus search on specific sports (NFL, NBA, MLB, NHL, MLS, etc.)

---

## Architecture

```
src/
├── App.tsx                 # Main application shell and routing
├── main.tsx               # Entry point
├── index.css              # Global styles
│
├── components/
│   ├── PromptEditor.tsx   # Brand criteria input form
│   ├── RecommendationCard.tsx  # Team result card with score
│   ├── TeamDetailView.tsx      # Full team profile
│   ├── CampaignGeneratorModal.tsx  # AI campaign creation
│   ├── CampaignView.tsx        # Campaign display
│   └── Sidebar.tsx             # Navigation sidebar
│
├── lib/
│   ├── api.ts             # Convex API client functions
│   └── ai.ts              # AI utility functions
│
└── types/
    └── index.ts           # TypeScript type definitions
```

---

## Application Flow

### 1. Initial State
User lands on the search page with `PromptEditor`:
- Enter brand description query
- Select target regions (Northeast, Southeast, etc.)
- Choose target demographics (Gen-Z, Families, etc.)
- Select brand values (Community, Innovation, etc.)
- Pick goals (Digital Presence, Local Presence, etc.)
- Filter by leagues (NFL, NBA, MLB, etc.)

### 2. Search Execution
When user submits:
1. Brand criteria is sent to Convex action `computeBrandSimilarity`
2. Server embeds the criteria using Gemini API
3. Computes cosine similarity against all team embeddings in `All_Teams_Clean`
4. Applies multi-factor scoring (region, values, demographics, tier)
5. Returns paginated results sorted by similarity score

### 3. Results View
- Displays team cards with similarity scores
- Shows key metrics (league, region, reach scores)
- Pagination controls with prefetched next page
- Click to view team details

### 4. Team Detail View
- Full team information from `All_Teams`
- Social media followers, valuation data
- AI-generated analysis (strengths, partnership ideas)
- Option to generate campaign

### 5. Campaign Generation
- Select media strategy
- Choose touchpoints (LED, Jumbotron, Jersey, etc.)
- Upload brand assets (optional)
- AI generates:
  - Campaign title and executive summary
  - Touchpoint activations
  - Creative concepts
  - Visual mockups (via Imagen 3)

---

## Component Details

### PromptEditor

Multi-field form for brand criteria input:

```typescript
interface SearchFilters {
  regions: string[];        // Target geographic regions
  demographics: string[];   // Target audience segments
  brandValues: string[];    // Brand value alignment
  leagues: string[];        // Sport/league filters
  goals: string[];          // Partnership objectives
  touchpoints: string[];    // Desired activation types
  budgetMin?: number;       // Budget range
  budgetMax?: number;
}
```

**Filter Options:**

| Category | Options |
|----------|---------|
| Regions | Northeast, Southeast, Midwest, Southwest, West |
| Demographics | Gen-Z, Millennials, Gen-X, Boomers, Families, Women, Men |
| Values | Community, Innovation, Tradition, Performance, Sustainability |
| Goals | Digital Presence, Local Presence, Brand Awareness, B2B |
| Leagues | NFL, NBA/G League/WNBA, MLB/MiLB, NHL/AHL/ECHL, MLS/NWSL |

### RecommendationCard

Displays a team match with:
- Team logo and name
- League and region
- Similarity score (0-100%)
- Key metrics (digital reach, local reach, family-friendly)
- Quick actions

### TeamDetailView

Full team profile showing:
- Basic info (name, league, region, website)
- Social media followers breakdown
- Financial data (franchise value, revenue, ticket price)
- Stadium ownership
- Community programs and CSR initiatives
- AI-generated analysis

### CampaignGeneratorModal

Wizard for creating sponsorship campaigns:
1. **Strategy Selection**: Choose media strategy approach
2. **Touchpoint Selection**: Pick activation types
3. **Additional Notes**: Custom instructions
4. **Asset Upload**: Brand logos, images
5. **Generation**: AI creates complete campaign

---

## API Integration

### Convex Queries/Actions

| Endpoint | Purpose |
|----------|---------|
| `scraperImport:getSampleTeams` | Fetch full team data for display |
| `All_Teams_Clean:getCount` | Get total team count |
| `All_Teams_Clean:getAll` | Fetch preprocessed teams |
| `similarityScoring:computeBrandSimilarity` | Run similarity search |
| `teamAnalysis:generateTeamAnalysis` | Generate AI team analysis |
| `campaignGeneration:generateCampaign` | Create sponsorship campaign |
| `campaignGeneration:regenerateVisuals` | Generate campaign visuals |
| `storage:generateUploadUrl` | Get file upload URL |

### Example API Call

```typescript
// Compute similarity
const result = await computeSimilarity(
  "Regional beverage company seeking community engagement",
  {
    regions: ["midwest", "southeast"],
    demographics: ["families", "millennials"],
    brandValues: ["community"],
    leagues: ["MLB MiLB"],
    goals: ["local-presence"],
  },
  1,  // page
  50  // pageSize
);

// Result:
{
  teams: ScoredTeam[],
  totalCount: 247,
  totalPages: 5,
  currentPage: 1,
  hasNextPage: true,
  hasPreviousPage: false
}
```

---

## Development

### Prerequisites

- Node.js 18+
- npm or pnpm
- Running Convex backend

### Setup

```bash
# Install dependencies
npm install

# Create .env file
echo "VITE_CONVEX_URL=https://your-deployment.convex.cloud" > .env

# Start development server
npm run dev
```

### Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server on http://localhost:5173 |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_CONVEX_URL` | Yes | Convex deployment URL |

---

## Types

### Core Types

```typescript
interface Team {
  _id: string;
  name: string;
  region?: string;
  league?: string;
  official_url?: string;
  logo_url?: string;
  
  // Social media
  followers_x?: number;
  followers_instagram?: number;
  followers_facebook?: number;
  followers_tiktok?: number;
  subscribers_youtube?: number;
  
  // Valuation
  franchise_value?: number;
  annual_revenue?: number;
  avg_ticket_price?: number;
  
  // Stadium
  owns_stadium?: boolean;
  stadium_name?: string;
  
  // Programs
  family_program_types?: string[];
  community_programs?: string[];
  cause_partnerships?: string[];
  mission_tags?: string[];
}

interface ScoredTeam {
  _id: string;
  name: string;
  region: string;
  league: string;
  official_url: string;
  
  // Computed scores
  similarity_score: number;
  digital_reach?: number;
  local_reach?: number;
  family_friendly?: number;
  value_tier: number;
  
  // Demographic weights
  women_weight?: number;
  men_weight?: number;
  gen_z_weight?: number;
  millenial_weight?: number;
  // ...
}

interface TeamRecommendation {
  scoredTeam: ScoredTeam;
  fullTeam?: Team;
}

interface GeneratedCampaign {
  title: string;
  executiveSummary: string;
  touchpointActivations: {
    touchpoint: string;
    title: string;
    description: string;
    estimatedReach?: string;
  }[];
  creativeConceptIdeas: string[];
  visualMockups?: string[];  // URLs
}
```

---

## Performance Optimizations

### Pagination with Prefetching

The app prefetches the next page while displaying current results:

```typescript
// On search result received, prefetch next page
if (result.hasNextPage) {
  prefetchPage(currentPage + 1, query, filters, true);
}
```

Benefits:
- Instant page transitions when clicking "Next"
- Visual indicator when next page is ready
- Minimal additional load on Convex

### Embedding Caching

Team embeddings are precomputed and stored in `All_Teams_Clean`:
- Embeddings generated once during preprocessing
- Search only embeds brand criteria (6 embeddings)
- No need to embed 500+ teams per search

---

## Related Documentation

- [Main README](../../README.md) - Project overview
- [Convex Backend README](../../packages/backend/convex/README.md) - Backend documentation
- [Scraper README](../scraper/README.md) - Data collection documentation
