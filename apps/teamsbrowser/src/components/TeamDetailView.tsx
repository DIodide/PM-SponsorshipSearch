import { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft02Icon,
  Link01Icon,
  SparklesIcon,
} from '@hugeicons/core-free-icons';
import type { ScoredTeam, Team, TeamDetailAnalysis, SearchFilters, SourceCitation, GeneratedCampaign } from '../types';
import { generateTeamDetailAnalysis, formatCurrency } from '../lib/ai';
import { inferSport, scoreToPercent, estimatePriceFromTier, formatFollowers, formatNumber } from '../lib/api';
import { buildSearchSummary } from './PromptEditor';
import { CampaignGeneratorModal } from './CampaignGeneratorModal';
import { CampaignView } from './CampaignView';

// Source type icons and colors
const sourceTypeConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  api: { color: 'text-blue-700', bgColor: 'bg-blue-50', label: 'API' },
  website: { color: 'text-emerald-700', bgColor: 'bg-emerald-50', label: 'Website' },
  database: { color: 'text-purple-700', bgColor: 'bg-purple-50', label: 'Database' },
  static: { color: 'text-gray-600', bgColor: 'bg-gray-100', label: 'Static' },
  cached: { color: 'text-amber-700', bgColor: 'bg-amber-50', label: 'Cached' },
};

// Helper to group sources by source name
function groupSourcesByName(sources: SourceCitation[]): Map<string, SourceCitation[]> {
  const grouped = new Map<string, SourceCitation[]>();
  for (const source of sources) {
    const existing = grouped.get(source.source_name) || [];
    existing.push(source);
    grouped.set(source.source_name, existing);
  }
  return grouped;
}

// Helper to format date
function formatSourceDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

// Data Sources component
function DataSourcesSection({ sources, scrapedAt }: { sources: SourceCitation[]; scrapedAt?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!sources || sources.length === 0) return null;
  
  // Deduplicate sources by URL
  const uniqueSources = Array.from(
    new Map(sources.map(s => [s.url, s])).values()
  );
  
  const grouped = groupSourcesByName(uniqueSources);
  const sourceNames = Array.from(grouped.keys()).sort();
  
  // Count by type
  const typeCounts = uniqueSources.reduce((acc, s) => {
    acc[s.source_type] = (acc[s.source_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return (
    <div className="pt-6 border-t border-gray-100">
      <div 
        className="flex items-center justify-between cursor-pointer group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-900">Data Sources</h3>
          <span className="text-xs text-gray-500">
            {uniqueSources.length} source{uniqueSources.length !== 1 ? 's' : ''}
          </span>
          {scrapedAt && (
            <span className="text-xs text-gray-400">
              • Last scraped {formatSourceDate(scrapedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Type badges summary */}
          <div className="flex items-center gap-1.5">
            {Object.entries(typeCounts).map(([type, count]) => {
              const config = sourceTypeConfig[type] || sourceTypeConfig.static;
              return (
                <span 
                  key={type}
                  className={`px-1.5 py-0.5 text-xs font-medium rounded ${config.bgColor} ${config.color}`}
                >
                  {count} {config.label}
                </span>
              );
            })}
          </div>
          <svg 
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      {expanded && (
        <div className="mt-4 space-y-4">
          {sourceNames.map(sourceName => {
            const sourcesForName = grouped.get(sourceName) || [];
            const firstSource = sourcesForName[0];
            const config = sourceTypeConfig[firstSource.source_type] || sourceTypeConfig.static;
            
            // Collect all unique fields sourced
            const allFields = new Set<string>();
            sourcesForName.forEach(s => {
              s.fields_sourced?.forEach(f => allFields.add(f));
            });
            
            return (
              <div key={sourceName} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${config.bgColor} ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="font-medium text-sm text-gray-900">{sourceName}</span>
                  </div>
                  {firstSource.is_primary === false && (
                    <span className="text-xs text-gray-400">Fallback</span>
                  )}
                </div>
                
                {/* URLs */}
                <div className="space-y-1">
                  {sourcesForName.slice(0, 3).map((source, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {source.url.startsWith('http') ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate max-w-md"
                          title={source.url}
                        >
                          {source.url.length > 60 ? source.url.slice(0, 60) + '...' : source.url}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-500 italic">
                          {source.url.replace('internal://', '')}
                        </span>
                      )}
                      {source.cache_hit && (
                        <span className="text-xs px-1 py-0.5 bg-amber-100 text-amber-700 rounded">cached</span>
                      )}
                    </div>
                  ))}
                  {sourcesForName.length > 3 && (
                    <span className="text-xs text-gray-400">
                      +{sourcesForName.length - 3} more URL{sourcesForName.length - 3 !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                
                {/* Fields sourced */}
                {allFields.size > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-xs text-gray-500">Fields:</span>
                    {Array.from(allFields).slice(0, 8).map(field => (
                      <span key={field} className="text-xs px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600">
                        {field.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {allFields.size > 8 && (
                      <span className="text-xs text-gray-400">+{allFields.size - 8} more</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Social media icons as SVGs
const SocialIcons: Record<string, React.FC<{ className?: string }>> = {
  twitter: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  instagram: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  ),
  facebook: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  youtube: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  tiktok: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  ),
};

interface TeamDetailViewProps {
  scoredTeam: ScoredTeam;
  fullTeam?: Team;
  filters: SearchFilters;
  query: string;
  onBack: () => void;
  onEditPrompt: () => void;
  onConvertToNegotiation: () => void;
}

export function TeamDetailView({
  scoredTeam,
  fullTeam,
  filters,
  query,
  onBack,
  onEditPrompt,
  onConvertToNegotiation,
}: TeamDetailViewProps) {
  const [analysis, setAnalysis] = useState<TeamDetailAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [generatedCampaign, setGeneratedCampaign] = useState<GeneratedCampaign | null>(null);
  const [showCampaignView, setShowCampaignView] = useState(false);

  // All hooks must be called before any conditional returns
  useEffect(() => {
    async function loadAnalysis() {
      setLoading(true);
      const result = await generateTeamDetailAnalysis(scoredTeam, fullTeam, filters);
      setAnalysis(result);
      setLoading(false);
    }
    loadAnalysis();
  }, [scoredTeam, fullTeam, filters]);

  const handleCampaignGenerated = (campaign: GeneratedCampaign) => {
    setGeneratedCampaign(campaign);
    setShowCampaignModal(false);
    setShowCampaignView(true);
  };

  const handleBackFromCampaign = () => {
    setShowCampaignView(false);
  };

  // If showing campaign view, render it as a full page
  if (showCampaignView && generatedCampaign) {
    return (
      <CampaignView
        campaign={generatedCampaign}
        onBack={handleBackFromCampaign}
        logoUrl={fullTeam?.logo_url}
        sponsors={fullTeam?.sponsors}
        category={fullTeam?.category}
      />
    );
  }

  const sport = inferSport(scoredTeam.league);
  const matchPercent = scoreToPercent(scoredTeam.similarity_score);
  const priceEstimate = estimatePriceFromTier(scoredTeam.value_tier, scoredTeam.league);
  
  const tierLabels: Record<number, string> = {
    1: 'Budget-Friendly',
    2: 'Mid-Tier',
    3: 'Premium',
  };

  // Get team data
  const logoUrl = fullTeam?.logo_url;
  const officialUrl = fullTeam?.official_url || scoredTeam.official_url;
  const socialHandles = fullTeam?.social_handles || [];
  
  // Social stats from fullTeam
  const socialStats = fullTeam ? [
    { platform: 'twitter', icon: SocialIcons.twitter, followers: fullTeam.followers_x, label: 'X / Twitter' },
    { platform: 'instagram', icon: SocialIcons.instagram, followers: fullTeam.followers_instagram, label: 'Instagram' },
    { platform: 'facebook', icon: SocialIcons.facebook, followers: fullTeam.followers_facebook, label: 'Facebook' },
    { platform: 'youtube', icon: SocialIcons.youtube, followers: fullTeam.subscribers_youtube, label: 'YouTube' },
    { platform: 'tiktok', icon: SocialIcons.tiktok, followers: fullTeam.followers_tiktok, label: 'TikTok' },
  ].filter(s => s.followers) : [];

  // Find social handle by platform
  const getSocialUrl = (platform: string): string | null => {
    const handle = socialHandles.find(h => {
      const p = h.platform.toLowerCase();
      const search = platform.toLowerCase();
      // Handle Twitter/X naming - data uses "x" but UI uses "twitter"
      if (search === 'twitter' || search === 'x') {
        return p === 'x' || p === 'twitter';
      }
      return p === search || p.includes(search);
    });
    return handle?.url || null;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Main Content - shrinks when modal is open */}
      <div className={`flex-1 min-w-0 transition-all duration-300 ${showCampaignModal ? 'mr-0' : ''}`}>
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
                Edit Criteria
              </button>
              <button
                onClick={() => setShowCampaignModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
              >
                <HugeiconsIcon icon={SparklesIcon} size={16} />
                Generate Campaign
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
        {/* Search Criteria Display */}
        <div className="mb-6">
          <div className="text-sm text-gray-500 mb-2">Search Criteria</div>
          <div className="bg-slate-800 text-white rounded-lg px-4 py-3 text-sm">
            {buildSearchSummary(query, filters)}
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Card Header */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">Recommended Partner</span>
              <span className="px-2.5 py-1 bg-teal-100 text-teal-700 text-sm font-medium rounded-full">
                {matchPercent}% Match
              </span>
            </div>
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
              {/* Team Logo */}
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoUrl ? (
                  <img 
                    src={logoUrl} 
                    alt={`${scoredTeam.name} logo`}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-2xl font-bold text-gray-500">${scoredTeam.name.charAt(0)}</span>`;
                    }}
                  />
                ) : (
                  <span className="text-2xl font-bold text-gray-500">
                    {scoredTeam.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900">{scoredTeam.name}</h1>
                <div className="flex items-center gap-2 mt-1 mb-3">
                  <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs font-medium rounded">
                    {scoredTeam.league || 'Unknown League'}
                  </span>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                    {tierLabels[scoredTeam.value_tier]}
                  </span>
                </div>
                
                {/* Social Links & Website */}
                <div className="flex items-center gap-2 flex-wrap">
                  {officialUrl && (
                    <a
                      href={officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium hover:bg-gray-200 transition-colors"
                    >
                      <HugeiconsIcon icon={Link01Icon} size={12} />
                      Official Website
                    </a>
                  )}
                  {socialStats.map(({ platform, icon: Icon, followers, label }) => {
                    const url = getSocialUrl(platform);
                    return (
                      <a
                        key={platform}
                        href={url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => !url && e.preventDefault()}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          url ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-50 text-gray-500 cursor-default'
                        }`}
                        title={`${label}: ${formatFollowers(followers)} followers`}
                      >
                        <Icon className="w-3 h-3" />
                        {formatFollowers(followers)}
                      </a>
                    );
                  })}
                </div>
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

            {/* Meta Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
              <div>
                <div className="text-sm text-gray-400 mb-1">Region</div>
                <div className="font-medium text-gray-900">{scoredTeam.region || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">League</div>
                <div className="font-medium text-gray-900">{scoredTeam.league || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">Sport</div>
                <div className="font-medium text-gray-900">{sport}</div>
              </div>
              
              <div>
                <div className="text-sm text-gray-400 mb-1">Price Estimate</div>
                <div className="font-medium text-gray-900">
                  {formatCurrency(priceEstimate)}
                </div>
              </div>
              
              {fullTeam?.geo_city && (
                <div>
                  <div className="text-sm text-gray-400 mb-1">City</div>
                  <div className="font-medium text-gray-900">{fullTeam.geo_city}</div>
                </div>
              )}
              {fullTeam?.stadium_name && (
                <div>
                  <div className="text-sm text-gray-400 mb-1">Stadium</div>
                  <div className="font-medium text-gray-900">
                    {fullTeam.stadium_name}
                    {fullTeam.owns_stadium !== null && fullTeam.owns_stadium !== undefined && (
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                        fullTeam.owns_stadium 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {fullTeam.owns_stadium ? 'Owned' : 'Leased'}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {fullTeam?.avg_game_attendance && (
                <div>
                  <div className="text-sm text-gray-400 mb-1">Avg Attendance</div>
                  <div className="font-medium text-gray-900">{fullTeam.avg_game_attendance.toLocaleString()}</div>
                </div>
              )}
              {fullTeam?.franchise_value && (
                <div>
                  <div className="text-sm text-gray-400 mb-1">Franchise Value</div>
                  <div className="font-medium text-gray-900">{formatNumber(fullTeam.franchise_value)}</div>
                </div>
              )}
            </div>

            {/* Scores */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Digital Reach</div>
                <div className="text-lg font-semibold text-gray-900">
                {(() => {
                  // 1. Define 'val' inside this specific block
                  const val = scoredTeam.digital_reach + 1; 
    
                  // 2. Determine the label and color
                  let label = "Low";
                  let color = "text-red-600";

                  if (val >= 0.6) {
                    label = "High";
                    color = "text-green-600";
                  } else if (val >= 0.15) {
                    label = "Medium";
                    color = "text-yellow-600";
                  }

                  // 3. Return everything together so 'val' is always in scope
                  return (
                    <>
                    <span className={color}>{label}</span>
                    </>
                  );
                  })()}
                </div>
                <div className="text-xs text-gray-400">Social media following</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Local Reach</div>
                <div className="text-lg font-semibold text-gray-900">
                {(() => {
                  // 1. Define 'val' inside this specific block
                  const val = scoredTeam.local_reach; 
    
                  // 2. Determine the label and color
                  let label = "Low";
                  let color = "text-red-600";

                  if (val >= -0.3) {
                    label = "High";
                    color = "text-green-600";
                  } else if (val >= -0.7) {
                    label = "Medium";
                    color = "text-yellow-600";
                  }

                  // 3. Return everything together so 'val' is always in scope
                  return (
                    <>
                    <span className={color}>{label}</span>
                    </>
                  );
                  })()}
                </div>
                <div className="text-xs text-gray-400">Attendance + population</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Family-Friendliness</div>
                <div className="text-lg font-semibold text-gray-900">
                {(() => {
                  // 1. Define 'val' inside this specific block
                  const val = scoredTeam.family_friendly ?? -1;
    
                  // 2. Determine the label and color
                  let label = "Low";
                  let color = "text-red-600";

                  if (val >= 0) {
                    label = "High";
                    color = "text-green-600";
                  } else if (val >= -0.5) {
                    label = "Medium";
                    color = "text-yellow-600";
                  }

                  // 3. Return everything together so 'val' is always in scope
                  return (
                    <>
                    <span className={color}>{label}</span>
                    </>
                  );
                  })()}
                </div>
                <div className="text-xs text-gray-400">Family-centered programs</div>
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
                          <span className="text-green-500 mt-1">✓</span>
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
                          <span className="text-amber-500 mt-1">•</span>
                          {con}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Audience */}
            {!loading && analysis && (
              <div className="mb-8">
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
            )}

            {/* Current Partners & Cause Partnerships - 2 column layout */}
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              {/* Current Partners (Sponsors) - Using real data from Convex */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Current Partners</h3>
                {fullTeam?.sponsors && fullTeam.sponsors.length > 0 ? (
                  <ul className="space-y-1.5">
                    {fullTeam.sponsors.map((sponsor, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-gray-400 mt-1">•</span>
                        <span>
                          <span className="text-gray-900 font-medium">
                            {typeof sponsor === 'string' ? sponsor : sponsor.name}
                          </span>
                          {typeof sponsor !== 'string' && (sponsor.category || sponsor.asset_type) && (
                            <span className="text-gray-500">
                              {' '}– {sponsor.asset_type || sponsor.category}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    {!fullTeam 
                      ? 'Team data not available (team not found in All_Teams table)' 
                      : 'No sponsor data has been collected for this team'}
                  </p>
                )}
              </div>

              {/* Cause Partnerships - Using real data from Convex */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Cause Partnerships</h3>
                {fullTeam?.cause_partnerships && fullTeam.cause_partnerships.length > 0 ? (
                  <ul className="space-y-1.5">
                    {fullTeam.cause_partnerships.map((cause, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-gray-400 mt-1">•</span>
                        {cause}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    {!fullTeam 
                      ? 'Team data not available' 
                      : 'No cause partnerships have been identified for this team'}
                  </p>
                )}
              </div>
            </div>

            {/* Family Programs & Community Programs - 2 column layout */}
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              {/* Family Programs - Using real data from Convex */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">
                  Family Programs
                  {fullTeam?.family_program_count ? (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({fullTeam.family_program_count} total)
                    </span>
                  ) : null}
                </h3>
                {fullTeam?.family_program_types && fullTeam.family_program_types.length > 0 ? (
                  <ul className="space-y-1.5">
                    {fullTeam.family_program_types.map((program, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-gray-400 mt-1">•</span>
                        {program}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    {!fullTeam 
                      ? 'Team data not available' 
                      : 'No family programs have been identified for this team'}
                  </p>
                )}
              </div>

              {/* Community Programs - Using real data from Convex */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Community Programs</h3>
                {fullTeam?.community_programs && fullTeam.community_programs.length > 0 ? (
                  <ul className="space-y-1.5">
                    {fullTeam.community_programs.map((program, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-gray-400 mt-1">•</span>
                        {program}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    {!fullTeam 
                      ? 'Team data not available' 
                      : 'No community programs have been identified for this team'}
                  </p>
                )}
              </div>
            </div>

            {/* AI Analysis Sources */}
            {!loading && analysis && analysis.sources.length > 0 && (
              <div className="pt-6 border-t border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-3">Analysis Sources</h3>
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
            
            {/* Actual Data Sources from Scraper */}
            {fullTeam?.sources && fullTeam.sources.length > 0 && (
              <DataSourcesSection 
                sources={fullTeam.sources} 
                scrapedAt={fullTeam.scraped_at}
              />
            )}
          </div>

          {/* Card Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-4">
            <button
              onClick={onEditPrompt}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Edit Criteria
            </button>
            <button
              onClick={() => setShowCampaignModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
            >
              <HugeiconsIcon icon={SparklesIcon} size={16} />
              Generate Campaign
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

      {/* Campaign Generator Panel - slides in from right */}
      {showCampaignModal && (
        <CampaignGeneratorModal
          teamId={scoredTeam._id}
          teamName={scoredTeam.name}
          teamLeague={scoredTeam.league}
          teamRegion={scoredTeam.region}
          onClose={() => setShowCampaignModal(false)}
          onCampaignGenerated={handleCampaignGenerated}
        />
      )}
    </div>
  );
}
