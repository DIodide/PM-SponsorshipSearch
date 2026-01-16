import { useState, useEffect, useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft02Icon,
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
import type { Team, TeamRecommendation, SearchFilters } from './types';

type ViewMode = 'initial' | 'recommendations' | 'detail';

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
  
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({
    regions: [],
    demographics: [],
    brandValues: [],
    leagues: [],
    goals: [],
  });

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

  // Handle search submission
  const handleSearch = useCallback(async (newQuery: string, newFilters: SearchFilters) => {
    setQuery(newQuery);
    setFilters(newFilters);
    setShowPromptEditor(false);
    setSearching(true);
    setError(null);
    setViewMode('recommendations');
    
    try {
      // Call the Convex similarity scoring action
      const scoredTeams = await computeSimilarity(newQuery, newFilters);
      
      // Convert to recommendations format
      const recs = scoredTeamsToRecommendations(scoredTeams, fullTeams);
      setRecommendations(recs);
    } catch (err) {
      console.error('Search failed:', err);
      setError('Failed to compute similarity. The All_Teams_Clean table may be empty. Please ensure the preprocessing has been run.');
      
      // Fallback: Load from All_Teams_Clean without similarity scoring
      try {
        const cleanTeams = await fetchAllTeamsClean();
        const recs = scoredTeamsToRecommendations(cleanTeams, fullTeams);
        setRecommendations(recs);
        setError('Showing all teams (similarity scoring unavailable)');
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
      }
    } finally {
      setSearching(false);
    }
  }, [fullTeams]);

  // Refresh recommendations
  const handleRefresh = useCallback(() => {
    if (query || Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : v !== undefined)) {
      handleSearch(query, filters);
    }
  }, [query, filters, handleSearch]);

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
                      {recommendations.length} teams found, sorted by similarity
                    </span>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6 mb-8">
                    {recommendations.slice(0, 4).map((rec) => (
                      <RecommendationCard
                        key={rec.scoredTeam._id}
                        recommendation={rec}
                        onClick={() => handleSelectTeam(rec)}
                      />
                    ))}
                  </div>

                  {/* More Results */}
                  {recommendations.length > 4 && (
                    <details className="mb-8">
                      <summary className="cursor-pointer text-sm text-teal-600 hover:text-teal-700 font-medium mb-4">
                        Show {recommendations.length - 4} more teams
                      </summary>
                      <div className="grid md:grid-cols-2 gap-6">
                        {recommendations.slice(4).map((rec) => (
                          <RecommendationCard
                            key={rec.scoredTeam._id}
                            recommendation={rec}
                            onClick={() => handleSelectTeam(rec)}
                          />
                        ))}
      </div>
                    </details>
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
