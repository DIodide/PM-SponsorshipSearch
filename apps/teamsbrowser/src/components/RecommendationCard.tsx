import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, Link01Icon } from '@hugeicons/core-free-icons';
import type { TeamRecommendation } from '../types';
import { formatNumber, formatFollowers } from '../lib/api';

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

interface RecommendationCardProps {
  recommendation: TeamRecommendation;
  onClick: () => void;
}

export function RecommendationCard({ recommendation, onClick }: RecommendationCardProps) {
  const { scoredTeam, fullTeam, matchPercent, priceEstimate, sport } = recommendation;
  
  // Tier styling
  const tierConfig: Record<number, { bg: string; text: string; label: string }> = {
    1: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Budget' },
    2: { bg: 'bg-sky-50', text: 'text-sky-700', label: 'Mid-Tier' },
    3: { bg: 'bg-violet-50', text: 'text-violet-700', label: 'Premium' },
  };
  const tier = tierConfig[scoredTeam.value_tier] || tierConfig[2];

  // Team data
  const socialHandles = fullTeam?.social_handles || [];
  const logoUrl = fullTeam?.logo_url;
  const officialUrl = fullTeam?.official_url || scoredTeam.official_url;

  // Social stats
  const socialStats = fullTeam ? {
    twitter: fullTeam.followers_x,
    instagram: fullTeam.followers_instagram,
    facebook: fullTeam.followers_facebook,
    youtube: fullTeam.subscribers_youtube,
    tiktok: fullTeam.followers_tiktok,
  } : {};

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

  // Get available social platforms with data
  const availableSocials = ['twitter', 'instagram', 'facebook', 'youtube', 'tiktok']
    .filter(platform => getSocialUrl(platform) || socialStats[platform as keyof typeof socialStats])
    .slice(0, 4); // Limit to 4 icons
  
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl hover:border-gray-200 transition-all duration-300 cursor-pointer group"
    >
      {/* Match Score Header */}
      <div className="relative h-2 bg-gray-100">
        <div 
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-400 to-teal-500 transition-all duration-500"
          style={{ width: `${matchPercent}%` }}
        />
      </div>

      <div className="p-5">
        {/* Top Row: Match + Tier */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-900">{matchPercent}%</span>
            <span className="text-sm text-gray-500">match</span>
          </div>
          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${tier.bg} ${tier.text}`}>
            {tier.label}
          </span>
        </div>

        {/* Team Info */}
        <div className="flex gap-4 mb-4">
          {/* Logo */}
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 border border-gray-100">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={scoredTeam.name}
                className="w-full h-full object-contain p-1"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML = 
                    `<span class="text-xl font-bold text-gray-400">${scoredTeam.name.charAt(0)}</span>`;
                }}
              />
            ) : (
              <span className="text-xl font-bold text-gray-400">
                {scoredTeam.name.charAt(0)}
              </span>
            )}
          </div>

          {/* Name & Meta */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-lg leading-tight truncate group-hover:text-teal-700 transition-colors">
              {scoredTeam.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
              <span className="font-medium text-gray-700">{scoredTeam.league || 'Unknown'}</span>
              <span className="text-gray-300">·</span>
              <span>{sport}</span>
              {scoredTeam.region && (
                <>
                  <span className="text-gray-300">·</span>
                  <span>{scoredTeam.region}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 mb-4 py-3 px-4 bg-gray-50/80 rounded-xl">
          <div className="flex-1 text-center border-r border-gray-200">
            <div className="text-xs text-gray-500 mb-0.5">Digital</div>
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
          </div>
          <div className="flex-1 text-center border-r border-gray-200">
            <div className="text-xs text-gray-500 mb-0.5">Local</div>
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
          </div>
          <div className="flex-1 text-center">
            <div className="text-xs text-gray-500 mb-0.5">Est. Price</div>
            <div className="text-sm font-semibold text-gray-900">
              {formatNumber(priceEstimate)}
            </div>
          </div>
        </div>

        {/* Social Links Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {officialUrl && (
              <a
                href={officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                title="Official Website"
              >
                <HugeiconsIcon icon={Link01Icon} size={14} className="text-gray-600" />
              </a>
            )}
            {availableSocials.map(platform => {
              const url = getSocialUrl(platform);
              const Icon = SocialIcons[platform];
              const followers = socialStats[platform as keyof typeof socialStats];
              
              return (
                <a
                  key={platform}
                  href={url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!url) e.preventDefault();
                  }}
                  className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                    url ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-50'
                  }`}
                  title={`${platform.charAt(0).toUpperCase() + platform.slice(1)}${followers ? `: ${formatFollowers(followers)}` : ''}`}
                >
                  <Icon className="w-3.5 h-3.5 text-gray-500" />
                  {followers && (
                    <span className="text-xs font-medium text-gray-600">
                      {formatFollowers(followers)}
                    </span>
                  )}
                </a>
              );
            })}
          </div>

          {/* View Details Arrow */}
          <div className="flex items-center gap-1 text-sm text-gray-400 group-hover:text-teal-600 transition-colors">
            <span className="hidden sm:inline">Details</span>
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}
