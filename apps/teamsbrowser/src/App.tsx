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
import { PromptEditor } from './components/PromptEditor';
import { fetchAllTeams } from './lib/api';
import { generateRecommendations, formatCurrency } from './lib/ai';
import type { Team, TeamRecommendation, RecommendationPrompt } from './types';

type ViewMode = 'initial' | 'recommendations' | 'detail';

function App() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeNav, setActiveNav] = useState('partnerships');
  const [viewMode, setViewMode] = useState<ViewMode>('initial');
  const [recommendations, setRecommendations] = useState<TeamRecommendation[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  
  const [prompt, setPrompt] = useState<RecommendationPrompt>({
    objective: '',
    budget: undefined,
    region: undefined,
  });

  // Load teams on mount
  useEffect(() => {
    async function loadTeams() {
      try {
        const data = await fetchAllTeams();
        setTeams(data);
      } catch (error) {
        console.error('Failed to load teams:', error);
      } finally {
        setLoading(false);
      }
    }
    loadTeams();
  }, []);

  // Handle prompt submission
  const handlePromptSubmit = useCallback(async (newPrompt: RecommendationPrompt) => {
    setPrompt(newPrompt);
    setShowPromptEditor(false);
    setGenerating(true);
    setViewMode('recommendations');
    
    try {
      const results = await generateRecommendations(teams, newPrompt);
      setRecommendations(results);
    } catch (error) {
      console.error('Failed to generate recommendations:', error);
    } finally {
      setGenerating(false);
    }
  }, [teams]);

  // Refresh recommendations
  const handleRefresh = useCallback(async () => {
    if (!prompt.objective) return;
    setGenerating(true);
    
    try {
      const results = await generateRecommendations(teams, prompt);
      setRecommendations(results);
    } catch (error) {
      console.error('Failed to refresh recommendations:', error);
    } finally {
      setGenerating(false);
    }
  }, [teams, prompt]);

  // Handle team selection
  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team);
    setViewMode('detail');
  };

  // Handle back from detail
  const handleBackToRecommendations = () => {
    setSelectedTeam(null);
    setViewMode('recommendations');
  };

  // Build prompt display string
  const promptDisplayString = prompt.objective
    ? `${prompt.objective}${prompt.budget ? ` Price: ${formatCurrency(prompt.budget)}.` : ''}${prompt.region ? ` Region: ${prompt.region}.` : ''}`
    : '';

  // Render detail view
  if (viewMode === 'detail' && selectedTeam) {
    return (
      <div className="flex min-h-screen">
        <Sidebar activeItem={activeNav} onItemClick={setActiveNav} />
        <div className="flex-1">
          <TeamDetailView
            team={selectedTeam}
            prompt={prompt}
            onBack={handleBackToRecommendations}
            onEditPrompt={() => setShowPromptEditor(true)}
            onConvertToNegotiation={() => {
              alert('Convert to Negotiation - This would open the negotiation workflow');
            }}
          />
        </div>
        
        {showPromptEditor && (
          <PromptEditor
            prompt={prompt}
            onSubmit={handlePromptSubmit}
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
                  Describe your sponsorship goals and we'll recommend the best sports team partners for your brand.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <PromptEditor
                  prompt={prompt}
                  onSubmit={handlePromptSubmit}
                />
              </div>

              {loading && (
                <div className="mt-6 text-center text-sm text-gray-500">
                  Loading {teams.length > 0 ? teams.length : ''} teams...
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
                  All Negotiations
                </button>
                <button
                  onClick={() => setShowPromptEditor(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <HugeiconsIcon icon={Edit02Icon} size={16} />
                  Edit Prompt
                </button>
              </div>

              {/* Prompt Display */}
              <div className="mb-8">
                <div className="text-sm text-gray-500 mb-2">AI-Recommendation Prompt</div>
                <div className="bg-slate-800 text-white rounded-lg px-4 py-3 text-sm">
                  {promptDisplayString}
                </div>
              </div>

              {/* Loading State */}
              {generating && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin mb-4" />
                  <p className="text-gray-600">Analyzing {teams.length} teams...</p>
                </div>
              )}

              {/* Recommendations Grid */}
              {!generating && recommendations.length > 0 && (
                <>
                  <div className="grid md:grid-cols-2 gap-6 mb-8">
                    {recommendations.slice(0, 4).map((rec) => (
                      <RecommendationCard
                        key={rec.team._id}
                        recommendation={rec}
                        onClick={() => handleSelectTeam(rec.team)}
                      />
                    ))}
                  </div>

                  {/* More Results */}
                  {recommendations.length > 4 && (
                    <details className="mb-8">
                      <summary className="cursor-pointer text-sm text-teal-600 hover:text-teal-700 font-medium mb-4">
                        Show {recommendations.length - 4} more recommendations
                      </summary>
                      <div className="grid md:grid-cols-2 gap-6">
                        {recommendations.slice(4).map((rec) => (
                          <RecommendationCard
                            key={rec.team._id}
                            recommendation={rec}
                            onClick={() => handleSelectTeam(rec.team)}
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
                      Edit Your Prompt
                    </button>
                    <button
                      onClick={handleRefresh}
                      disabled={generating}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
                    >
                      <HugeiconsIcon icon={RefreshIcon} size={16} />
                      Refresh Recommendations
                    </button>
                  </div>
                </>
              )}

              {/* No Results */}
              {!generating && recommendations.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-gray-600 mb-4">No recommendations found. Try adjusting your prompt.</p>
                  <button
                    onClick={() => setShowPromptEditor(true)}
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    Edit Prompt
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
          prompt={prompt}
          onSubmit={handlePromptSubmit}
          onClose={() => setShowPromptEditor(false)}
          isModal
        />
      )}
    </div>
  );
}

export default App;
