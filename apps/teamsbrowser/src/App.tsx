import { useState, useEffect, useCallback, useRef } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Edit02Icon,
  RefreshIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons';
import { Sidebar } from './components/Sidebar';
import { RecommendationCard } from './components/RecommendationCard';
import { TeamDetailView } from './components/TeamDetailView';
import { PromptEditor, buildSearchSummary } from './components/PromptEditor';
import { fetchAllTeams, computeSimilarity, fetchAllTeamsClean } from './lib/api';
import { scoredTeamsToRecommendations } from './lib/ai';
import type { Team, TeamRecommendation, SearchFilters, PaginatedSimilarityResponse } from './types';

type ViewMode = 'initial' | 'recommendations' | 'detail';

const PAGE_SIZE = 50;

// Cache for prefetched pages
type PageCache = {
  [page: number]: {
    recommendations: TeamRecommendation[];
    response: PaginatedSimilarityResponse;
  };
};

function App() {
  const [fullTeams, setFullTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [activeNav, setActiveNav] = useState('partnerships');
  const [viewMode, setViewMode] = useState<ViewMode>('initial');
  const [recommendations, setRecommendations] = useState<TeamRecommendation[]>([]);
  const [selectedRecommendation, setSelectedRecommendation] = useState<TeamRecommendation | null>(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  
  // Prefetch cache - stores prefetched next page data
  const pageCacheRef = useRef<PageCache>({});
  const prefetchingRef = useRef<Set<number>>(new Set()); // Track which pages are being prefetched
  const [nextPageReady, setNextPageReady] = useState(false); // Visual indicator when next page is cached
  
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({
    regions: [],
    demographics: [],
    brandValues: [],
    leagues: [],
    goals: [],
    touchpoints: [],
  });
  
  // Refs to track current search params (avoids stale closure issues)
  const queryRef = useRef(query);
  const filtersRef = useRef(filters);
  
  // Keep refs in sync with state
  useEffect(() => {
    queryRef.current = query;
    filtersRef.current = filters;
  }, [query, filters]);

  // Load full team data on mount (for additional info display)
  useEffect(() => {
    async function loadTeams() {
      try {
        const data = await fetchAllTeams();
        setFullTeams(data);
      } catch (err) {
        console.error('Failed to load teams:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTeams();
  }, []);

  // Clear cache when search criteria changes
  const clearCache = useCallback(() => {
    pageCacheRef.current = {};
  }, []);

  // Prefetch a specific page in the background
  const prefetchPage = useCallback(async (pageNum: number, searchQuery: string, searchFilters: SearchFilters, isNextPage: boolean = false) => {
    // Don't prefetch if already cached or already prefetching this specific page
    if (pageCacheRef.current[pageNum] || prefetchingRef.current.has(pageNum)) {
      // If already cached and it's the next page, mark as ready
      if (pageCacheRef.current[pageNum] && isNextPage) {
        setNextPageReady(true);
      }
      return;
    }
    
    // Mark this page as being prefetched
    prefetchingRef.current.add(pageNum);
    console.log(`Starting prefetch for page ${pageNum}...`);
    
    try {
      const result = await computeSimilarity(searchQuery, searchFilters, pageNum, PAGE_SIZE);
      const recs = scoredTeamsToRecommendations(result.teams, fullTeams);
      
      // Store in cache
      pageCacheRef.current[pageNum] = {
        recommendations: recs,
        response: result,
      };
      console.log(`✓ Prefetched page ${pageNum} successfully`);
      
      // If this was the next page, mark it as ready
      if (isNextPage) {
        setNextPageReady(true);
      }
    } catch (err) {
      console.error(`✗ Failed to prefetch page ${pageNum}:`, err);
    } finally {
      prefetchingRef.current.delete(pageNum);
    }
  }, [fullTeams]);

  // Handle search submission (resets to page 1)
  const handleSearch = useCallback(async (newQuery: string, newFilters: SearchFilters, page: number = 1) => {
    // Check if this is a new search (different query/filters) - use refs for accurate comparison
    const isNewSearch = newQuery !== queryRef.current || JSON.stringify(newFilters) !== JSON.stringify(filtersRef.current);
    
    console.log(`handleSearch called: page=${page}, isNewSearch=${isNewSearch}, cacheKeys=${Object.keys(pageCacheRef.current).join(',')}`);
    
    if (isNewSearch) {
      console.log('New search detected - clearing cache');
      clearCache();
    }
    
    // Update refs IMMEDIATELY so prefetch effect can use them
    // (Don't wait for the useEffect sync which happens after render)
    queryRef.current = newQuery;
    filtersRef.current = newFilters;
    
    setQuery(newQuery);
    setFilters(newFilters);
    setShowPromptEditor(false);
    setError(null);
    setViewMode('recommendations');
    
    // Check if we have this page cached
    const cached = pageCacheRef.current[page];
    if (cached && !isNewSearch) {
      console.log(`✓ Cache hit for page ${page} - showing instantly`);
      setCurrentPage(cached.response.currentPage);
      setTotalCount(cached.response.totalCount);
      setTotalPages(cached.response.totalPages);
      setHasNextPage(cached.response.hasNextPage);
      setHasPreviousPage(cached.response.hasPreviousPage);
      setRecommendations(cached.recommendations);
      
      // Trigger prefetch for the NEXT page (even on cache hit)
      if (cached.response.hasNextPage) {
        console.log(`Triggering prefetch for page ${page + 1} after cache hit`);
        prefetchPage(page + 1, newQuery, newFilters, true);
      }
      
      // Don't show spinner, don't fetch - return immediately
      return;
    }
    
    console.log(`Cache miss for page ${page} - fetching... (cached pages: ${Object.keys(pageCacheRef.current).join(',') || 'none'})`);
    
    setSearching(true);
    
    try {
      // Call the Convex similarity scoring action with pagination
      const result: PaginatedSimilarityResponse = await computeSimilarity(newQuery, newFilters, page, PAGE_SIZE);
      
      // Update pagination state
      setCurrentPage(result.currentPage);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
      setHasNextPage(result.hasNextPage);
      setHasPreviousPage(result.hasPreviousPage);
      
      // Convert to recommendations format
      const recs = scoredTeamsToRecommendations(result.teams, fullTeams);
      setRecommendations(recs);
      
      // Cache the current page
      pageCacheRef.current[page] = {
        recommendations: recs,
        response: result,
      };
      
      // Trigger prefetch for next page directly (don't rely on useEffect)
      if (result.hasNextPage) {
        console.log(`Triggering prefetch for page ${page + 1} directly from handleSearch`);
        prefetchPage(page + 1, newQuery, newFilters, true);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setError('Failed to compute similarity. The All_Teams_Clean table may be empty. Please ensure the preprocessing has been run.');
      
      // Fallback: Load from All_Teams_Clean without similarity scoring
      try {
        const cleanTeams = await fetchAllTeamsClean();
        const recs = scoredTeamsToRecommendations(cleanTeams, fullTeams);
        setRecommendations(recs);
        setTotalCount(cleanTeams.length);
        setTotalPages(1);
        setCurrentPage(1);
        setHasNextPage(false);
        setHasPreviousPage(false);
        setError('Showing all teams (similarity scoring unavailable)');
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
      }
    } finally {
      setSearching(false);
    }
  }, [fullTeams, clearCache, prefetchPage]); // Using refs for query/filters comparison

  // Reset nextPageReady when page changes (prefetch is now triggered directly from handleSearch)
  useEffect(() => {
    setNextPageReady(false);
  }, [currentPage]);

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    // Use refs to get current query/filters
    handleSearch(queryRef.current, filtersRef.current, newPage);
  }, [totalPages, handleSearch]);

  // Refresh recommendations (stays on current page)
  const handleRefresh = useCallback(() => {
    const currentQuery = queryRef.current;
    const currentFilters = filtersRef.current;
    if (currentQuery || Object.values(currentFilters).some(v => Array.isArray(v) ? v.length > 0 : v !== undefined)) {
      handleSearch(currentQuery, currentFilters, currentPage);
    }
  }, [currentPage, handleSearch]);

  // Handle team selection
  const handleSelectTeam = (rec: TeamRecommendation) => {
    setSelectedRecommendation(rec);
    setViewMode('detail');
  };

  // Handle back from detail
  const handleBackToRecommendations = () => {
    setSelectedRecommendation(null);
    setViewMode('recommendations');
  };

  // Build search summary string
  const searchSummary = buildSearchSummary(query, filters);

  // Render detail view
  if (viewMode === 'detail' && selectedRecommendation) {
    return (
      <div className="flex min-h-screen">
        <Sidebar activeItem={activeNav} onItemClick={setActiveNav} />
        <div className="flex-1">
          <TeamDetailView
            scoredTeam={selectedRecommendation.scoredTeam}
            fullTeam={selectedRecommendation.fullTeam}
            filters={filters}
            query={query}
            onBack={handleBackToRecommendations}
            onEditPrompt={() => setShowPromptEditor(true)}
            onConvertToNegotiation={() => {
              alert('Convert to Negotiation - This would open the negotiation workflow');
            }}
          />
        </div>
        
        {showPromptEditor && (
          <PromptEditor
            query={query}
            filters={filters}
            onSubmit={handleSearch}
            onClose={() => setShowPromptEditor(false)}
            isModal
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar activeItem={activeNav} onItemClick={setActiveNav} />
      
      <div className="flex-1">
        {/* Breadcrumb */}
        <div className="bg-white border-b px-6 py-3">
          <div className="text-sm text-gray-500">
            Negotiation Portal <span className="mx-2">›</span>
            <span className="text-gray-900">AI-Recommended Partners</span>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-6 py-8">
          {/* Initial State - Show Prompt Editor */}
          {viewMode === 'initial' && (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center mx-auto mb-4">
                  <HugeiconsIcon icon={SparklesIcon} size={28} className="text-white" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Find Your Perfect Partner
                </h1>
                <p className="text-gray-600">
                  Use semantic similarity matching to find sports teams that align with your brand values and objectives.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <PromptEditor
                  query={query}
                  filters={filters}
                  onSubmit={handleSearch}
                />
              </div>

              {loading && (
                <div className="mt-6 text-center text-sm text-gray-500">
                  Loading team data...
                </div>
              )}
            </div>
          )}

          {/* Recommendations View */}
          {viewMode === 'recommendations' && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => setViewMode('initial')}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
                  New Search
                </button>
                <button
                  onClick={() => setShowPromptEditor(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <HugeiconsIcon icon={Edit02Icon} size={16} />
                  Edit Criteria
                </button>
              </div>

              {/* Search Summary Display */}
              <div className="mb-8">
                <div className="text-sm text-gray-500 mb-2">Search Criteria</div>
                <div className="bg-slate-800 text-white rounded-lg px-4 py-3 text-sm">
                  {searchSummary}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  {error}
                </div>
              )}

              {/* Loading State */}
              {searching && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin mb-4" />
                  <p className="text-gray-600">Computing similarity scores...</p>
                  <p className="text-sm text-gray-500 mt-1">Embedding your criteria and matching against teams</p>
                </div>
              )}

              {/* Recommendations Grid */}
              {!searching && recommendations.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-500">
                      Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} teams
    
                    </span>
                    <span className="text-sm text-gray-500">
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6 mb-8">
                    {recommendations.map((rec) => (
                      <RecommendationCard
                        key={rec.scoredTeam._id}
                        recommendation={rec}
                        onClick={() => handleSelectTeam(rec)}
                      />
                    ))}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mb-8">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={!hasPreviousPage || searching}
                        className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
                        Previous
                      </button>
                      
                      {/* Page Numbers */}
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() => handlePageChange(pageNum)}
                              disabled={searching}
                              className={`w-10 h-10 text-sm font-medium rounded-lg transition-colors ${
                                pageNum === currentPage
                                  ? 'bg-teal-600 text-white'
                                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                              } disabled:opacity-50`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={!hasNextPage || searching}
                        className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          nextPageReady && hasNextPage
                            ? 'text-teal-700 bg-teal-50 border border-teal-300 hover:bg-teal-100'
                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                        }`}
                        title={nextPageReady ? 'Next page ready - instant load' : 'Loading next page...'}
                      >
                        Next
                        <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
                        {hasNextPage && !nextPageReady && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Prefetching..." />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => setShowPromptEditor(true)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Edit Criteria
                    </button>
                    <button
                      onClick={handleRefresh}
                      disabled={searching}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
                    >
                      <HugeiconsIcon icon={RefreshIcon} size={16} />
                      Refresh Results
                    </button>
                  </div>
                </>
              )}

              {/* No Results */}
              {!searching && recommendations.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-gray-600 mb-4">
                    No matching teams found. Try adjusting your search criteria.
                  </p>
                  <button
                    onClick={() => setShowPromptEditor(true)}
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    Edit Criteria
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Prompt Editor Modal */}
      {showPromptEditor && (
        <PromptEditor
          query={query}
          filters={filters}
          onSubmit={handleSearch}
          onClose={() => setShowPromptEditor(false)}
          isModal
        />
      )}
    </div>
  );
}

export default App;
