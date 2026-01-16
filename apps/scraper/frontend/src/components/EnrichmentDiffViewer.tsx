import { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Add01Icon,
  Edit02Icon,
  Delete02Icon,
  Search01Icon,
  SourceCodeIcon,
  GridViewIcon,
  Copy01Icon,
  Tick01Icon,
  Download01Icon,
  FilterIcon,
} from '@hugeicons/core-free-icons';
import type { EnrichmentDiff, EnrichmentTeamDiff, EnrichmentFieldChange } from '@/types';
import { fetchEnrichmentTaskDiff } from '@/lib/api';
import { FIELD_METADATA } from '@/types';

interface EnrichmentDiffViewerProps {
  taskId: string;
  taskName: string;
  onClose: () => void;
}

type ViewMode = 'visual' | 'json';

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.join(', ');
  }
  return String(value);
}

function getFieldLabel(field: string): string {
  return FIELD_METADATA[field]?.label || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Change type badge
function ChangeTypeBadge({ type }: { type: EnrichmentFieldChange['change_type'] }) {
  const styles = {
    added: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: Add01Icon },
    modified: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Edit02Icon },
    removed: { bg: 'bg-red-100', text: 'text-red-700', icon: Delete02Icon },
  };
  const { bg, text, icon } = styles[type];
  
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', bg, text)}>
      <HugeiconsIcon icon={icon} size={10} />
      {type}
    </span>
  );
}

// Single field change row
function FieldChangeRow({ change }: { change: EnrichmentFieldChange }) {
  const isAdded = change.change_type === 'added';
  
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{getFieldLabel(change.field)}</span>
          <ChangeTypeBadge type={change.change_type} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          {!isAdded && (
            <>
              <span className="text-muted-foreground bg-red-50 px-2 py-0.5 rounded line-through">
                {formatValue(change.old_value)}
              </span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="text-muted-foreground shrink-0" />
            </>
          )}
          <span className="text-foreground bg-emerald-50 px-2 py-0.5 rounded">
            {formatValue(change.new_value)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Team diff card (collapsible)
function TeamDiffCard({ team, isExpanded, onToggle }: { 
  team: EnrichmentTeamDiff; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border rounded-lg bg-card">
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
      >
        <HugeiconsIcon 
          icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon} 
          size={16} 
          className="text-muted-foreground shrink-0" 
        />
        <div className="flex-1 min-w-0">
          <span className="font-medium">{team.team_name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {team.fields_added > 0 && (
            <span className="flex items-center gap-1 text-emerald-600">
              <HugeiconsIcon icon={Add01Icon} size={12} />
              {team.fields_added} added
            </span>
          )}
          {team.fields_modified > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <HugeiconsIcon icon={Edit02Icon} size={12} />
              {team.fields_modified} modified
            </span>
          )}
        </div>
      </button>
      
      {isExpanded && team.changes.length > 0 && (
        <div className="px-4 pb-3 border-t">
          <div className="mt-2">
            {team.changes.map((change, idx) => (
              <FieldChangeRow key={`${change.field}-${idx}`} change={change} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function EnrichmentDiffViewer({ taskId, taskName, onClose }: EnrichmentDiffViewerProps) {
  const [diff, setDiff] = useState<EnrichmentDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [jsonCopied, setJsonCopied] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'added' | 'modified'>('all');
  
  // Fetch diff on mount
  useEffect(() => {
    async function loadDiff() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchEnrichmentTaskDiff(taskId);
        setDiff(data);
        // Auto-expand first 3 teams
        const firstThree = data.teams.slice(0, 3).map(t => t.team_name);
        setExpandedTeams(new Set(firstThree));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load diff');
      } finally {
        setLoading(false);
      }
    }
    loadDiff();
  }, [taskId]);
  
  // Filter teams based on search and filter type
  const filteredTeams = useMemo(() => {
    if (!diff) return [];
    
    let teams = diff.teams;
    
    // Filter by search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      teams = teams.filter(t => 
        t.team_name.toLowerCase().includes(search) ||
        t.changes.some(c => c.field.toLowerCase().includes(search))
      );
    }
    
    // Filter by change type
    if (filterType !== 'all') {
      teams = teams.map(team => ({
        ...team,
        changes: team.changes.filter(c => c.change_type === filterType),
        fields_added: filterType === 'added' ? team.fields_added : 0,
        fields_modified: filterType === 'modified' ? team.fields_modified : 0,
      })).filter(t => t.changes.length > 0);
    }
    
    return teams;
  }, [diff, searchTerm, filterType]);
  
  // Toggle team expansion
  const toggleTeam = useCallback((teamName: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamName)) {
        next.delete(teamName);
      } else {
        next.add(teamName);
      }
      return next;
    });
  }, []);
  
  // Expand/collapse all
  const expandAll = useCallback(() => {
    if (!diff) return;
    setExpandedTeams(new Set(diff.teams.map(t => t.team_name)));
  }, [diff]);
  
  const collapseAll = useCallback(() => {
    setExpandedTeams(new Set());
  }, []);
  
  // Copy JSON
  const handleCopyJson = useCallback(async () => {
    if (!diff) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diff, null, 2));
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [diff]);
  
  // Download JSON
  const handleDownloadJson = useCallback(() => {
    if (!diff) return;
    const blob = new Blob([JSON.stringify(diff, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enrichment-diff-${taskId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [diff, taskId]);
  
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-muted/30">
          <div>
            <h2 className="text-lg font-semibold">Enrichment Changes</h2>
            <p className="text-sm text-muted-foreground">{taskName}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              <button
                onClick={() => setViewMode('visual')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5",
                  viewMode === 'visual' 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <HugeiconsIcon icon={GridViewIcon} size={14} />
                Visual
              </button>
              <button
                onClick={() => setViewMode('json')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5",
                  viewMode === 'json' 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <HugeiconsIcon icon={SourceCodeIcon} size={14} />
                JSON
              </button>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={20} />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Loading changes...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-red-600">
                <p className="font-medium">Error loading diff</p>
                <p className="text-sm opacity-80">{error}</p>
              </div>
            </div>
          ) : diff ? (
            <>
              {/* Summary Stats */}
              <div className="p-4 border-b bg-muted/10">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-background rounded-lg border">
                    <div className="text-2xl font-bold text-primary">{diff.teams_changed}</div>
                    <div className="text-xs text-muted-foreground">Teams Changed</div>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg border">
                    <div className="text-2xl font-bold text-emerald-600">{diff.total_fields_added}</div>
                    <div className="text-xs text-muted-foreground">Fields Added</div>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg border">
                    <div className="text-2xl font-bold text-amber-600">{diff.total_fields_modified}</div>
                    <div className="text-xs text-muted-foreground">Fields Modified</div>
                  </div>
                </div>
              </div>
              
              {viewMode === 'visual' ? (
                <>
                  {/* Search & Filter Bar */}
                  <div className="p-4 border-b flex items-center gap-3">
                    <div className="relative flex-1">
                      <HugeiconsIcon 
                        icon={Search01Icon} 
                        size={16} 
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
                      />
                      <input
                        type="text"
                        placeholder="Search teams or fields..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm"
                      />
                    </div>
                    
                    <div className="flex items-center gap-1 border rounded-lg p-1">
                      <button
                        onClick={() => setFilterType('all')}
                        className={cn(
                          "px-2 py-1 rounded text-xs font-medium transition-colors",
                          filterType === 'all' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        )}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFilterType('added')}
                        className={cn(
                          "px-2 py-1 rounded text-xs font-medium transition-colors",
                          filterType === 'added' ? "bg-emerald-600 text-white" : "hover:bg-muted text-emerald-600"
                        )}
                      >
                        Added
                      </button>
                      <button
                        onClick={() => setFilterType('modified')}
                        className={cn(
                          "px-2 py-1 rounded text-xs font-medium transition-colors",
                          filterType === 'modified' ? "bg-amber-600 text-white" : "hover:bg-muted text-amber-600"
                        )}
                      >
                        Modified
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <button
                        onClick={expandAll}
                        className="px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-muted transition-colors"
                        title="Expand all"
                      >
                        <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
                      </button>
                      <button
                        onClick={collapseAll}
                        className="px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-muted transition-colors"
                        title="Collapse all"
                      >
                        <HugeiconsIcon icon={ArrowUp01Icon} size={14} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Team List */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredTeams.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        {searchTerm || filterType !== 'all' 
                          ? 'No teams match your filters'
                          : 'No changes were made during this enrichment'
                        }
                      </div>
                    ) : (
                      filteredTeams.map((team) => (
                        <TeamDiffCard
                          key={team.team_name}
                          team={team}
                          isExpanded={expandedTeams.has(team.team_name)}
                          onToggle={() => toggleTeam(team.team_name)}
                        />
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* JSON View Header */}
                  <div className="p-4 border-b flex items-center gap-2">
                    <button
                      onClick={handleCopyJson}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <HugeiconsIcon icon={jsonCopied ? Tick01Icon : Copy01Icon} size={14} />
                      {jsonCopied ? 'Copied!' : 'Copy JSON'}
                    </button>
                    <button
                      onClick={handleDownloadJson}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80 transition-colors"
                    >
                      <HugeiconsIcon icon={Download01Icon} size={14} />
                      Download
                    </button>
                  </div>
                  
                  {/* JSON Content */}
                  <div className="flex-1 overflow-auto p-4">
                    <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                      {JSON.stringify(diff, null, 2)}
                    </pre>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
