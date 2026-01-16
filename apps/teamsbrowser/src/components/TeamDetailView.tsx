import { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft02Icon,
  Edit02Icon,
  ArrowRight02Icon,
} from '@hugeicons/core-free-icons';
import type { Team, TeamDetailAnalysis, RecommendationPrompt } from '../types';
import { generateTeamDetailAnalysis, formatCurrency } from '../lib/ai';

interface TeamDetailViewProps {
  team: Team;
  prompt: RecommendationPrompt;
  onBack: () => void;
  onEditPrompt: () => void;
  onConvertToNegotiation: () => void;
}

function inferSport(league: string | null | undefined): string {
  if (!league) return 'Sports';
  const l = league.toLowerCase();
  if (l.includes('nfl') || l.includes('football')) return 'Football';
  if (l.includes('nba') || l.includes('basketball') || l.includes('g league') || l.includes('wnba')) return 'Basketball';
  if (l.includes('mlb') || l.includes('baseball') || l.includes('triple-a') || l.includes('double-a') || l.includes('class a') || l.includes('high-a')) return 'Baseball';
  if (l.includes('nhl') || l.includes('hockey') || l.includes('ahl') || l.includes('echl')) return 'Hockey';
  if (l.includes('mls') || l.includes('soccer') || l.includes('usl') || l.includes('nwsl') || l.includes('wpsl')) return 'Soccer';
  return 'Sports';
}

export function TeamDetailView({
  team,
  prompt,
  onBack,
  onEditPrompt,
  onConvertToNegotiation,
}: TeamDetailViewProps) {
  const [analysis, setAnalysis] = useState<TeamDetailAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalysis() {
      setLoading(true);
      const result = await generateTeamDetailAnalysis(team, prompt);
      setAnalysis(result);
      setLoading(false);
    }
    loadAnalysis();
  }, [team, prompt]);

  const sport = inferSport(team.league);
  const region = team.geo_city 
    ? `${team.geo_city}, ${team.geo_country === 'USA' || team.geo_country === 'US' ? 'TX' : team.geo_country || ''}`
    : team.region || 'Unknown';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
              Partner Options
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onEditPrompt}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Edit Prompt
              </button>
              <button
                onClick={onConvertToNegotiation}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
              >
                Convert to Negotiation
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Prompt Display */}
        <div className="mb-6">
          <div className="text-sm text-gray-500 mb-2">AI-Recommendation Prompt</div>
          <div className="bg-slate-800 text-white rounded-lg px-4 py-3 text-sm">
            {prompt.objective}
            {prompt.budget && ` Price: ${formatCurrency(prompt.budget)}.`}
            {prompt.region && ` Region: ${prompt.region}.`}
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Card Header */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div className="text-sm text-gray-500">Recommended Partner</div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Status:</span>
              {loading ? (
                <span className="text-teal-600 font-medium">Generating...</span>
              ) : (
                <span className="text-green-600 font-medium">Complete</span>
              )}
            </div>
          </div>

          {/* Team Info */}
          <div className="px-6 py-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {team.logo_url ? (
                  <img
                    src={team.logo_url}
                    alt={team.name}
                    className="w-12 h-12 object-contain"
                  />
                ) : (
                  <span className="text-2xl font-bold text-gray-400">
                    {team.name.charAt(0)}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
              </div>
            </div>

            {/* Description */}
            {loading ? (
              <div className="space-y-3 mb-8">
                <div className="h-4 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 bg-gray-100 rounded animate-pulse w-5/6" />
                <div className="h-4 bg-gray-100 rounded animate-pulse w-4/6" />
              </div>
            ) : (
              <p className="text-gray-700 leading-relaxed mb-8">
                {analysis?.description}
              </p>
            )}

            {/* Meta Info */}
            <div className="grid grid-cols-4 gap-8 mb-8">
              <div>
                <div className="text-sm text-gray-400 mb-1">Region</div>
                <div className="font-medium text-gray-900">{region}</div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">League</div>
                <div className="font-medium text-gray-900">{team.league || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">Sport</div>
                <div className="font-medium text-gray-900">{sport}</div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">Price Estimate</div>
                <div className="font-medium text-gray-900">
                  {analysis ? formatCurrency(analysis.priceEstimate) : '—'}
                </div>
              </div>
            </div>

            {/* Pros and Cons */}
            {!loading && analysis && (
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Pros</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <ul className="space-y-2">
                      {analysis.pros.map((pro, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-gray-400 mt-1">•</span>
                          {pro}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Cons</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <ul className="space-y-2">
                      {analysis.cons.map((con, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-gray-400 mt-1">•</span>
                          {con}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Audience and Partners */}
            {!loading && analysis && (
              <div className="grid md:grid-cols-2 gap-8 mb-8">
                {/* Audience */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Audience</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-2">Primary Audience:</div>
                      <ul className="space-y-1.5">
                        {analysis.primaryAudience.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="text-gray-400 mt-1">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-2">Secondary Audience:</div>
                      <ul className="space-y-1.5">
                        {analysis.secondaryAudience.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="text-gray-400 mt-1">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-2">Audience Characteristics:</div>
                      <ul className="space-y-1.5">
                        {analysis.audienceCharacteristics.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="text-gray-400 mt-1">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Current Partners */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Current Partners</h3>
                  <ol className="space-y-2">
                    {analysis.currentPartners.map((partner, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-gray-500 font-medium">{i + 1}.</span>
                        {partner}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {/* Sources */}
            {!loading && analysis && (
              <div className="pt-6 border-t border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-3">Sources</h3>
                <ul className="space-y-1.5">
                  {analysis.sources.map((source, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-500 italic">
                      <span>•</span>
                      {source}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Card Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-4">
            <button
              onClick={onEditPrompt}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Edit Your Prompt
            </button>
            <button
              onClick={onConvertToNegotiation}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
            >
              Convert to Negotiation
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
