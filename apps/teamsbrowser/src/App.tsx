import { useState, useEffect, useCallback } from 'react';
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
import { fetchAllTeams, computeSimilarity, fetchAllTeamsClean, fetchTeamCount } from './lib/api';
import { scoredTeamsToRecommendations } from './lib/ai';
import type { Team, TeamRecommendation, SearchFilters, PaginatedSimilarityResponse } from './types';

type ViewMode = 'initial' | 'recommendations' | 'detail';

const PAGE_SIZE = 20;

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
  const [totalTeamsInDb, setTotalTeamsInDb] = useState<number | null>(null);
  
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({
    regions: [],
    demographics: [],
    brandValues: [],
    leagues: [],
    goals: [],
    touchpoints: [],
  });

  // Load full team data on mount (for additional info display)
  useEffect(() => {
    async function loadTeams() {
      try {
        const [data, count] = await Promise.all([
          fetchAllTeams(),
          fetchTeamCount(),
        ]);
        setFullTeams(data);
        setTotalTeamsInDb(count);
      } catch (err) {
        console.error('Failed to load teams:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTeams();
  }, []);

  // Handle search submission (resets to page 1)
  const handleSearch = useCallback(async (newQuery: string, newFilters: SearchFilters, page: number = 1) => {
    setQuery(newQuery);
    setFilters(newFilters);
    setShowPromptEditor(false);
    setSearching(true);
    setError(null);
    setViewMode('recommendations');
    
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
  }, [fullTeams]);

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    handleSearch(query, filters, newPage);
  }, [query, filters, totalPages, handleSearch]);

  // Refresh recommendations (stays on current page)
  const handleRefresh = useCallback(() => {
    if (query || Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : v !== undefined)) {
      handleSearch(query, filters, currentPage);
    }
  }, [query, filters, currentPage, handleSearch]);

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
                      {totalTeamsInDb !== null && (
                        <span className="ml-2 text-gray-400">
                          ({totalTeamsInDb} total in database)
                        </span>
                      )}
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
                        className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                        <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
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
