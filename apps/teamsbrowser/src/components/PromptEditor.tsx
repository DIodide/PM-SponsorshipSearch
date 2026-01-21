import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { 
  SparklesIcon, 
  Cancel01Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons';
import { 
  REGIONS, 
  DEMOGRAPHICS, 
  BRAND_VALUES, 
  LEAGUES, 
  GOALS,
  TOUCHPOINTS,
  type SearchFilters,
} from '../types';

interface PromptEditorProps {
  filters: SearchFilters;
  query: string;
  onSubmit: (query: string, filters: SearchFilters) => void;
  onClose?: () => void;
  isModal?: boolean;
}

// Badge component for filter chips
function FilterBadge({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
        selected
          ? 'bg-teal-600 text-white border-transparent'
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

// Filter section component
function FilterSection({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <FilterBadge
            key={option.value}
            label={option.label}
            selected={selected.includes(option.value)}
            onClick={() => onToggle(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

export function PromptEditor({ 
  filters: initialFilters, 
  query: initialQuery,
  onSubmit, 
  onClose, 
  isModal = false 
}: PromptEditorProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(true);

  const toggleFilter = (
    category: keyof Pick<SearchFilters, 'regions' | 'demographics' | 'brandValues' | 'leagues' | 'goals' | 'touchpoints'>,
    value: string
  ) => {
    setFilters((prev) => ({
      ...prev,
      [category]: prev[category].includes(value)
        ? prev[category].filter((v) => v !== value)
        : [...prev[category], value],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const hasFilters = 
      filters.regions.length > 0 || 
      filters.demographics.length > 0 || 
      filters.brandValues.length > 0 || 
      filters.leagues.length > 0 || 
      filters.goals.length > 0 ||
      filters.touchpoints.length > 0 ||
      filters.budgetMin !== undefined ||
      filters.budgetMax !== undefined;
    
    if (!query.trim() && !hasFilters) {
      return;
    }
    
    onSubmit(query, filters);
  };

  const activeFilterCount =
    filters.regions.length +
    filters.demographics.length +
    filters.brandValues.length +
    filters.leagues.length +
    filters.goals.length +
    filters.touchpoints.length +
    (filters.budgetMin ? 1 : 0) +
    (filters.budgetMax ? 1 : 0);

  const clearFilters = () => {
    setFilters({
      regions: [],
      demographics: [],
      brandValues: [],
      leagues: [],
      goals: [],
      touchpoints: [],
    });
    setQuery('');
  };

  const content = (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Toggle Filters */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <HugeiconsIcon icon={Settings02Icon} size={16} />
        <span>Filter Options</span>
        {activeFilterCount > 0 && (
          <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-medium rounded-full">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="space-y-5 pt-2 border-t border-gray-100">

          {/* Regions */}
          <FilterSection
            label="Target Regions"
            options={REGIONS}
            selected={filters.regions}
            onToggle={(value) => toggleFilter('regions', value)}
          />

          {/* Leagues */}
          <FilterSection
            label="Preferred Sports"
            options={LEAGUES}
            selected={filters.leagues}
            onToggle={(value) => toggleFilter('leagues', value)}
          />

          {/* Demographics */}
          <FilterSection
            label="Target Demographics"
            options={DEMOGRAPHICS}
            selected={filters.demographics}
            onToggle={(value) => toggleFilter('demographics', value)}
          />

          {/* Brand Values */}
          <FilterSection
            label="Brand Values Alignment"
            options={BRAND_VALUES}
            selected={filters.brandValues}
            onToggle={(value) => toggleFilter('brandValues', value)}
          />

          {/* Goals */}
          <FilterSection
            label="Sponsorship Goals"
            options={GOALS}
            selected={filters.goals}
            onToggle={(value) => toggleFilter('goals', value)}
          />

          {/* Touchpoints */}
          <FilterSection
            label="Touchpoints"
            options={TOUCHPOINTS}
            selected={filters.touchpoints}
            onToggle={(value) => toggleFilter('touchpoints', value)}
          />

          {/* Budget Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Budget Range
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <input
                  type="number"
                  placeholder="Min ($)"
                  value={filters.budgetMin || ''}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      budgetMin: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                />
              </div>
              <span className="text-gray-400 text-sm">to</span>
              <div className="flex-1">
                <input
                  type="number"
                  placeholder="Max ($)"
                  value={filters.budgetMax || ''}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      budgetMax: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Clear Filters */}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} />
              Clear all filters
            </button>
          )}


        </div>
      )}

      {/* Search Query Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Describe your sponsorship objective
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g., 'Looking for community-focused teams to build local brand awareness with families'"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none bg-white"
          rows={2}
        />
        <p className="mt-1.5 text-xs text-gray-500">
          This text will be embedded and matched against team values
        </p>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-3 pt-2">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!query.trim() && activeFilterCount === 0}
          className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <HugeiconsIcon icon={SparklesIcon} size={16} />
          Find Matching Teams
        </button>
      </div>
    </form>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Edit Search Criteria</h2>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={20} className="text-gray-500" />
              </button>
            )}
          </div>
          <div className="p-6">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return content;
}

/**
 * Build a human-readable summary of the search criteria
 */
export function buildSearchSummary(query: string, filters: SearchFilters): string {
  const parts: string[] = [];
  
  if (query.trim()) {
    parts.push(`"${query.trim()}"`);
  }
  
  if (filters.budgetMin || filters.budgetMax) {
    const budgetStr = filters.budgetMin && filters.budgetMax
      ? `Budget: $${(filters.budgetMin / 1000).toFixed(0)}K–$${(filters.budgetMax / 1000).toFixed(0)}K`
      : filters.budgetMin
        ? `Budget: $${(filters.budgetMin / 1000).toFixed(0)}K+`
        : `Budget: up to $${(filters.budgetMax! / 1000).toFixed(0)}K`;
    parts.push(budgetStr);
  }
  
  if (filters.regions.length > 0) {
    parts.push(`Regions: ${filters.regions.join(', ')}`);
  }
  
  if (filters.leagues.length > 0) {
    parts.push(`Leagues: ${filters.leagues.join(', ')}`);
  }
  
  if (filters.demographics.length > 0) {
    parts.push(`Demographics: ${filters.demographics.join(', ')}`);
  }
  
  if (filters.brandValues.length > 0) {
    parts.push(`Values: ${filters.brandValues.join(', ')}`);
  }
  
  if (filters.goals.length > 0) {
    parts.push(`Goals: ${filters.goals.join(', ')}`);
  }
  
  if (filters.touchpoints.length > 0) {
    parts.push(`Touchpoints: ${filters.touchpoints.join(', ')}`);
  }
  
  return parts.join('. ') || 'No criteria specified';
}
