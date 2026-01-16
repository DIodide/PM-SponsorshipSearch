import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { SparklesIcon, Cancel01Icon } from '@hugeicons/core-free-icons';
import type { RecommendationPrompt } from '../types';

interface PromptEditorProps {
  prompt: RecommendationPrompt;
  onSubmit: (prompt: RecommendationPrompt) => void;
  onClose?: () => void;
  isModal?: boolean;
}

const REGIONS = [
  'All Regions',
  'Northeast',
  'Southeast',
  'Southern',
  'Midwest',
  'Southwest',
  'West Coast',
  'Pacific Northwest',
];

const BUDGET_OPTIONS = [
  { label: 'Any budget', value: undefined },
  { label: '$250,000', value: 250000 },
  { label: '$500,000', value: 500000 },
  { label: '$1,000,000', value: 1000000 },
  { label: '$2,000,000', value: 2000000 },
  { label: '$5,000,000', value: 5000000 },
  { label: '$10,000,000+', value: 10000000 },
];

const EXAMPLE_PROMPTS = [
  'Reach young families through a partnership with a community-focused team',
  'Build brand awareness with millennial sports fans in urban markets',
  'Connect with local communities through grassroots youth sports programs',
  'Engage with passionate fan bases in minor league markets',
  'Partner with teams that have strong digital and social media presence',
];

export function PromptEditor({ prompt, onSubmit, onClose, isModal = false }: PromptEditorProps) {
  const [objective, setObjective] = useState(prompt.objective);
  const [budget, setBudget] = useState<number | undefined>(prompt.budget);
  const [region, setRegion] = useState(prompt.region || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!objective.trim()) return;
    onSubmit({
      objective: objective.trim(),
      budget,
      region: region && region !== 'All Regions' ? region : undefined,
    });
  };

  const content = (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Objective Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          What's your sponsorship objective?
        </label>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Describe what you want to achieve with a sports partnership..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
          rows={3}
        />
        {/* Example prompts */}
        <div className="mt-3">
          <div className="text-xs text-gray-500 mb-2">Try an example:</div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.slice(0, 3).map((example, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setObjective(example)}
                className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors truncate max-w-[200px]"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Budget and Region */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Budget
          </label>
          <select
            value={budget || ''}
            onChange={(e) => setBudget(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
          >
            {BUDGET_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value || ''}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Region
          </label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-3">
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
          disabled={!objective.trim()}
          className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <HugeiconsIcon icon={SparklesIcon} size={16} />
          Get Recommendations
        </button>
      </div>
    </form>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Edit Your Prompt</h2>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={20} className="text-gray-500" />
              </button>
            )}
          </div>
          {content}
        </div>
      </div>
    );
  }

  return content;
}
