import { HugeiconsIcon } from '@hugeicons/react';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import type { TeamRecommendation } from '../types';
import { formatCurrency } from '../lib/ai';

interface RecommendationCardProps {
  recommendation: TeamRecommendation;
  onClick: () => void;
}

export function RecommendationCard({ recommendation, onClick }: RecommendationCardProps) {
  const { team, matchScore, description, priceEstimate, sport } = recommendation;
  
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-gray-300 transition-all cursor-pointer group"
    >
      {/* Match Score */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">{matchScore}% Match</span>
        <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <HugeiconsIcon icon={Tick02Icon} size={14} className="text-green-600" />
        </div>
      </div>

      {/* Team Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
          {team.logo_url ? (
            <img
              src={team.logo_url}
              alt={team.name}
              className="w-10 h-10 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="text-lg font-bold text-gray-400">
              {team.name.charAt(0)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{team.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs font-medium rounded">
              {team.league || 'Unknown'}
            </span>
            {team.region && (
              <span className="text-xs text-gray-500">
                ◎ {team.region}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 leading-relaxed mb-4 line-clamp-4">
        {description}
      </p>

      {/* Footer Info */}
      <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-100">
        <div>
          <div className="text-xs text-gray-400 mb-1">Region</div>
          <div className="text-sm font-medium text-gray-900 truncate">
            {team.geo_city ? `${team.geo_city}${team.geo_country === 'US' || team.geo_country === 'USA' ? '' : `, ${team.geo_country}`}` : team.region || '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-1">League</div>
          <div className="text-sm font-medium text-gray-900 truncate">
            {team.league || '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-1">Sport</div>
          <div className="text-sm font-medium text-gray-900">
            {sport}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-1">Price Estimate</div>
          <div className="text-sm font-medium text-gray-900">
            {formatCurrency(priceEstimate)}
          </div>
        </div>
      </div>
    </div>
  );
}
