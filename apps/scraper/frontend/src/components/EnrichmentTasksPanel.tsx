import { useState, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  SparklesIcon,
  Loading03Icon,
  Tick01Icon,
  Cancel01Icon,
  PlayIcon,
  Clock01Icon,
  AlertCircleIcon,
  ArrowRight01Icon,
  Delete02Icon,
  RefreshIcon,
  ChartLineData02Icon,
  Layers01Icon,
  UserMultiple02Icon,
  Location01Icon,
  Building03Icon,
  HeartCheckIcon,
  DollarCircleIcon,
  Tag01Icon,
  InformationCircleIcon,
  CheckmarkSquare01Icon,
  SquareIcon,
  EyeIcon,
} from '@hugeicons/core-free-icons';
import type { 
  EnricherInfo, 
  EnrichmentTask, 
  EnrichmentTaskProgress,
  EnrichmentTaskStatus,
  ScraperInfo 
} from '@/types';
import { 
  fetchEnrichers, 
  fetchEnrichmentTasks,
  createEnrichmentTask,
  cancelEnrichmentTask,
  subscribeToTaskUpdates,
  fetchEnrichmentStatus,
} from '@/lib/api';
import { EnrichmentDiffViewer } from './EnrichmentDiffViewer';

// Map enricher IDs to icons
const ENRICHER_ICONS: Record<string, typeof InformationCircleIcon> = {
  geo: Location01Icon,
  social: UserMultiple02Icon,
  website: HeartCheckIcon,
  sponsor: Building03Icon,
  valuation: DollarCircleIcon,
  brand: Tag01Icon,
};

// Friendly names for enricher IDs
const ENRICHER_NAMES: Record<string, string> = {
  geo: 'Geographic Data',
  social: 'Social Media',
  website: 'Family Programs',
  sponsor: 'Stadium & Sponsors',
  valuation: 'Pricing & Valuation',
  brand: 'Brand Alignment',
};

// Status colors
const STATUS_COLORS: Record<EnrichmentTaskStatus, { bg: string; text: string; border: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  running: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  completed: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  cancelled: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
};

interface EnrichmentTasksProps {
  scrapers: ScraperInfo[];
  onTaskComplete?: () => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return date.toLocaleDateString();
}

// ============ Task Card Component ============

interface TaskCardProps {
  task: EnrichmentTask;
  onCancel: (taskId: string) => void;
  onViewDiff: (task: EnrichmentTask) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function TaskCard({ task, onCancel, onViewDiff, isExpanded, onToggleExpand }: TaskCardProps) {
  const statusColors = STATUS_COLORS[task.status];
  const isActive = task.status === 'running' || task.status === 'pending';
  
  // Calculate overall progress based on teams
  const progressEntries = Object.values(task.progress);
  const runningEnricher = progressEntries.find(p => p.status === 'running');
  const completedEnrichers = progressEntries.filter(p => p.status === 'completed' || p.status === 'failed').length;
  const totalEnrichers = task.enricher_ids.length;
  
  // Calculate team-level progress for currently running enricher
  let teamsProcessed = 0;
  let teamsTotal = task.teams_total || 0;
  
  if (runningEnricher) {
    teamsProcessed = runningEnricher.teams_processed || 0;
    teamsTotal = runningEnricher.teams_total || teamsTotal;
  }
  
  // Overall progress: completed enrichers + partial progress of current enricher
  const enricherProgress = totalEnrichers > 0 
    ? completedEnrichers / totalEnrichers 
    : 0;
  const currentEnricherProgress = teamsTotal > 0 
    ? (teamsProcessed / teamsTotal) / totalEnrichers 
    : 0;
  const progressPercent = Math.round((enricherProgress + currentEnricherProgress) * 100);

  // Calculate time elapsed/total
  const startTime = task.started_at ? new Date(task.started_at).getTime() : null;
  const endTime = task.completed_at ? new Date(task.completed_at).getTime() : Date.now();
  const elapsedMs = startTime ? endTime - startTime : 0;
  
  return (
    <div 
      className={cn(
        "rounded-xl border transition-all duration-200",
        statusColors.border,
        isActive && "ring-1 ring-primary/30"
      )}
    >
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="w-full p-4 flex items-center gap-4 text-left hover:bg-muted/30 transition-colors"
      >
        {/* Status Icon */}
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
          statusColors.bg
        )}>
          {task.status === 'running' ? (
            <HugeiconsIcon icon={Loading03Icon} size={20} className={cn(statusColors.text, "animate-spin")} />
          ) : task.status === 'pending' ? (
            <HugeiconsIcon icon={Clock01Icon} size={20} className={statusColors.text} />
          ) : task.status === 'completed' ? (
            <HugeiconsIcon icon={Tick01Icon} size={20} className={statusColors.text} />
          ) : task.status === 'cancelled' ? (
            <HugeiconsIcon icon={Cancel01Icon} size={20} className={statusColors.text} />
          ) : (
            <HugeiconsIcon icon={AlertCircleIcon} size={20} className={statusColors.text} />
          )}
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium">{task.scraper_name}</span>
            <span className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium",
              statusColors.bg, statusColors.text
            )}>
              {task.status.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{task.enricher_ids.length} enricher{task.enricher_ids.length !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span>{task.teams_total} teams</span>
            <span>•</span>
            <span>{formatRelativeTime(task.created_at)}</span>
            {elapsedMs > 0 && (
              <>
                <span>•</span>
                <span>{formatDuration(elapsedMs)}</span>
              </>
            )}
          </div>
        </div>
        
        {/* Progress / Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {isActive && (
            <div className="text-right min-w-[80px]">
              <div className="text-sm font-medium">{progressPercent}%</div>
              {runningEnricher && teamsProcessed > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  {teamsProcessed}/{teamsTotal} teams
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {completedEnrichers}/{totalEnrichers} enrichers
              </div>
            </div>
          )}
          
          {task.status === 'completed' && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium text-green-600">
                  {task.teams_enriched}
                </div>
                <div className="text-xs text-muted-foreground">enriched</div>
              </div>
              {task.has_diff && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDiff(task);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  title="View changes"
                >
                  <HugeiconsIcon icon={EyeIcon} size={14} />
                  Changes
                </button>
              )}
            </div>
          )}
          
          {isActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel(task.id);
              }}
              className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
              title="Cancel task"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </button>
          )}
          
          <HugeiconsIcon 
            icon={ArrowRight01Icon} 
            size={16} 
            className={cn(
              "text-muted-foreground transition-transform",
              isExpanded && "rotate-90"
            )}
          />
        </div>
      </button>
      
      {/* Progress Bar */}
      {isActive && (
        <div className="px-4 pb-2">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
      
      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t px-4 py-3 space-y-2 bg-muted/20">
          {Object.values(task.progress).map((progress) => {
            const Icon = ENRICHER_ICONS[progress.enricher_id] || InformationCircleIcon;
            const name = ENRICHER_NAMES[progress.enricher_id] || progress.enricher_name;
            const pStatusColors = STATUS_COLORS[progress.status as EnrichmentTaskStatus] || STATUS_COLORS.pending;
            
            return (
              <div 
                key={progress.enricher_id}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg",
                  progress.status === 'running' && "bg-blue-50/50"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  pStatusColors.bg
                )}>
                  {progress.status === 'running' ? (
                    <HugeiconsIcon icon={Loading03Icon} size={16} className={cn(pStatusColors.text, "animate-spin")} />
                  ) : progress.status === 'completed' ? (
                    <HugeiconsIcon icon={Tick01Icon} size={16} className={pStatusColors.text} />
                  ) : progress.status === 'failed' ? (
                    <HugeiconsIcon icon={AlertCircleIcon} size={16} className={pStatusColors.text} />
                  ) : (
                    <HugeiconsIcon icon={Icon} size={16} className="text-muted-foreground" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{name}</div>
                  {progress.error && (
                    <div className="text-xs text-red-600 truncate">{progress.error}</div>
                  )}
                  {progress.status === 'completed' && (
                    <div className="text-xs text-muted-foreground">
                      {progress.teams_enriched} of {progress.teams_processed} teams • {formatDuration(progress.duration_ms)}
                    </div>
                  )}
                  {progress.status === 'running' && (
                    <div className="text-xs text-blue-600">
                      {progress.teams_processed > 0 
                        ? `${progress.teams_processed}/${progress.teams_total} teams (${progress.teams_enriched} enriched)`
                        : 'Starting...'}
                    </div>
                  )}
                </div>
                
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium shrink-0",
                  pStatusColors.bg, pStatusColors.text
                )}>
                  {progress.status}
                </span>
              </div>
            );
          })}
          
          {task.error && (
            <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
              {task.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ Create Task Modal ============

interface CreateTaskModalProps {
  scrapers: ScraperInfo[];
  enrichers: EnricherInfo[];
  onClose: () => void;
  onSubmit: (scraperId: string, enricherIds: string[]) => Promise<void>;
}

function CreateTaskModal({ scrapers, enrichers, onClose, onSubmit }: CreateTaskModalProps) {
  const [selectedScraperId, setSelectedScraperId] = useState<string>('');
  const [selectedEnrichers, setSelectedEnrichers] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const availableEnrichers = enrichers.filter(e => e.available);
  
  const toggleEnricher = (id: string) => {
    setSelectedEnrichers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  const selectAllEnrichers = () => {
    setSelectedEnrichers(new Set(availableEnrichers.map(e => e.id)));
  };
  
  const selectNoneEnrichers = () => {
    setSelectedEnrichers(new Set());
  };
  
  const handleSubmit = async () => {
    if (!selectedScraperId || selectedEnrichers.size === 0) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      await onSubmit(selectedScraperId, Array.from(selectedEnrichers));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const selectedScraper = scrapers.find(s => s.id === selectedScraperId);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <HugeiconsIcon icon={SparklesIcon} size={24} className="text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Start Enrichment Task</h2>
                <p className="text-sm text-muted-foreground">
                  Select a dataset and enrichers to run
                </p>
              </div>
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Dataset Selection */}
          <div>
            <label className="block text-sm font-medium mb-3">
              Select Dataset
            </label>
            <div className="grid grid-cols-2 gap-3">
              {scrapers.filter(s => s.last_teams_count > 0).map(scraper => (
                <button
                  key={scraper.id}
                  onClick={() => setSelectedScraperId(scraper.id)}
                  className={cn(
                    "p-4 rounded-xl border text-left transition-all",
                    selectedScraperId === scraper.id 
                      ? "border-primary bg-primary/5 ring-2 ring-primary"
                      : "hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <div className="font-medium mb-1">{scraper.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {scraper.last_teams_count} teams
                  </div>
                </button>
              ))}
            </div>
            
            {scrapers.filter(s => s.last_teams_count > 0).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <HugeiconsIcon icon={AlertCircleIcon} size={32} className="mx-auto mb-2 opacity-50" />
                <p>No scraped data available. Run a scraper first.</p>
              </div>
            )}
          </div>
          
          {/* Enricher Selection */}
          {selectedScraperId && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium">
                  Select Enrichers
                </label>
                <div className="flex items-center gap-2 text-sm">
                  <button
                    onClick={selectAllEnrichers}
                    className="text-primary hover:underline"
                  >
                    All
                  </button>
                  <span className="text-muted-foreground">•</span>
                  <button
                    onClick={selectNoneEnrichers}
                    className="text-primary hover:underline"
                  >
                    None
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                {enrichers.map(enricher => {
                  const Icon = ENRICHER_ICONS[enricher.id] || InformationCircleIcon;
                  const name = ENRICHER_NAMES[enricher.id] || enricher.name;
                  const isSelected = selectedEnrichers.has(enricher.id);
                  const isAvailable = enricher.available;
                  
                  return (
                    <button
                      key={enricher.id}
                      onClick={() => isAvailable && toggleEnricher(enricher.id)}
                      disabled={!isAvailable}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                        isSelected && isAvailable && "border-primary bg-primary/5",
                        !isAvailable && "opacity-50 cursor-not-allowed",
                        isAvailable && !isSelected && "hover:border-primary/50"
                      )}
                    >
                      {/* Checkbox */}
                      <div className={cn(
                        "w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors",
                        isSelected && isAvailable 
                          ? "bg-primary text-white" 
                          : "border-2 border-muted-foreground/30"
                      )}>
                        {isSelected && isAvailable && (
                          <HugeiconsIcon icon={Tick01Icon} size={12} />
                        )}
                      </div>
                      
                      {/* Icon */}
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        isSelected && isAvailable ? "bg-primary/10" : "bg-muted"
                      )}>
                        <HugeiconsIcon 
                          icon={Icon} 
                          size={16} 
                          className={isSelected && isAvailable ? "text-primary" : "text-muted-foreground"}
                        />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{name}</span>
                          {!isAvailable && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700">
                              Not Available
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {enricher.description}
                        </p>
                      </div>
                      
                      <span className="text-xs text-muted-foreground shrink-0">
                        {enricher.fields_added.length} fields
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              <HugeiconsIcon icon={AlertCircleIcon} size={16} />
              {error}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t bg-muted/30 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedScraperId && selectedScraper && (
              <span>
                {selectedEnrichers.size} enricher{selectedEnrichers.size !== 1 ? 's' : ''} selected for {selectedScraper.last_teams_count} teams
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border hover:bg-muted transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedScraperId || selectedEnrichers.size === 0 || isSubmitting}
              className={cn(
                "inline-flex items-center gap-2 px-5 py-2 rounded-lg font-medium transition-all",
                selectedScraperId && selectedEnrichers.size > 0 && !isSubmitting
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {isSubmitting ? (
                <>
                  <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={PlayIcon} size={16} />
                  Start Task
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ Main Component ============

export function EnrichmentTasksPanel({ scrapers, onTaskComplete }: EnrichmentTasksProps) {
  const [tasks, setTasks] = useState<EnrichmentTask[]>([]);
  const [enrichers, setEnrichers] = useState<EnricherInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingDiffTask, setViewingDiffTask] = useState<EnrichmentTask | null>(null);
  
  // Track active task subscriptions
  const [subscriptions, setSubscriptions] = useState<Map<string, () => void>>(new Map());
  
  // Load tasks and enrichers
  const loadData = useCallback(async () => {
    try {
      const [tasksRes, enrichersRes] = await Promise.all([
        fetchEnrichmentTasks(),
        fetchEnrichers(),
      ]);
      setTasks(tasksRes.tasks);
      setEnrichers(enrichersRes);
      setError(null);
      
      // Subscribe to active tasks
      tasksRes.tasks.forEach(task => {
        if ((task.status === 'pending' || task.status === 'running') && !subscriptions.has(task.id)) {
          const unsubscribe = subscribeToTaskUpdates(
            task.id,
            (updatedTask) => {
              setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
              
              // Check if task completed
              if (['completed', 'failed', 'cancelled'].includes(updatedTask.status)) {
                onTaskComplete?.();
                // Clean up subscription
                setSubscriptions(prev => {
                  const next = new Map(prev);
                  const unsub = next.get(task.id);
                  unsub?.();
                  next.delete(task.id);
                  return next;
                });
              }
            },
            (err) => console.error('Task subscription error:', err)
          );
          setSubscriptions(prev => new Map(prev).set(task.id, unsubscribe));
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [onTaskComplete, subscriptions]);
  
  useEffect(() => {
    loadData();
    
    // Cleanup subscriptions on unmount
    return () => {
      subscriptions.forEach(unsub => unsub());
    };
  }, []);
  
  // Polling for task list updates (every 10s)
  useEffect(() => {
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);
  
  const handleCreateTask = async (scraperId: string, enricherIds: string[]) => {
    const task = await createEnrichmentTask(scraperId, enricherIds);
    setTasks(prev => [task, ...prev]);
    setExpandedTaskId(task.id);
    
    // Subscribe to the new task
    const unsubscribe = subscribeToTaskUpdates(
      task.id,
      (updatedTask) => {
        setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
        
        if (['completed', 'failed', 'cancelled'].includes(updatedTask.status)) {
          onTaskComplete?.();
          setSubscriptions(prev => {
            const next = new Map(prev);
            const unsub = next.get(task.id);
            unsub?.();
            next.delete(task.id);
            return next;
          });
        }
      },
      (err) => console.error('Task subscription error:', err)
    );
    setSubscriptions(prev => new Map(prev).set(task.id, unsubscribe));
  };
  
  const handleCancelTask = async (taskId: string) => {
    try {
      await cancelEnrichmentTask(taskId);
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, status: 'cancelled' as const } : t
      ));
    } catch (err) {
      console.error('Failed to cancel task:', err);
    }
  };
  
  // Separate active and historical tasks
  const activeTasks = tasks.filter(t => t.status === 'pending' || t.status === 'running');
  const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled');
  
  if (loading) {
    return (
      <div className="bg-card rounded-xl border p-8">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Loading enrichment tasks...
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-card rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b bg-gradient-to-r from-violet-500/10 via-fuchsia-500/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <HugeiconsIcon icon={Layers01Icon} size={22} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Enrichment Tasks</h3>
              <p className="text-sm text-muted-foreground">
                {activeTasks.length} active • {completedTasks.length} completed
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData()}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Refresh"
            >
              <HugeiconsIcon icon={RefreshIcon} size={18} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium shadow-sm"
            >
              <HugeiconsIcon icon={PlayIcon} size={16} />
              New Task
            </button>
          </div>
        </div>
      </div>
      
      {/* Error */}
      {error && (
        <div className="mx-5 mt-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}
      
      {/* Empty State */}
      {tasks.length === 0 && !error && (
        <div className="p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <HugeiconsIcon icon={SparklesIcon} size={32} className="text-muted-foreground" />
          </div>
          <h4 className="font-semibold mb-2">No enrichment tasks yet</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Start a new task to enrich your scraped team data with additional information.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            <HugeiconsIcon icon={PlayIcon} size={16} />
            Create First Task
          </button>
        </div>
      )}
      
      {/* Task Lists */}
      {tasks.length > 0 && (
        <div className="p-5 space-y-6">
          {/* Active Tasks */}
          {activeTasks.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
                Active Tasks
              </h4>
              <div className="space-y-3">
                {activeTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onCancel={handleCancelTask}
                    onViewDiff={setViewingDiffTask}
                    isExpanded={expandedTaskId === task.id}
                    onToggleExpand={() => setExpandedTaskId(
                      expandedTaskId === task.id ? null : task.id
                    )}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <HugeiconsIcon icon={ChartLineData02Icon} size={14} />
                Recent Tasks
              </h4>
              <div className="space-y-3">
                {completedTasks.slice(0, 10).map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onCancel={handleCancelTask}
                    onViewDiff={setViewingDiffTask}
                    isExpanded={expandedTaskId === task.id}
                    onToggleExpand={() => setExpandedTaskId(
                      expandedTaskId === task.id ? null : task.id
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Create Task Modal */}
      {showCreateModal && (
        <CreateTaskModal
          scrapers={scrapers}
          enrichers={enrichers}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateTask}
        />
      )}
      
      {/* Diff Viewer Modal */}
      {viewingDiffTask && (
        <EnrichmentDiffViewer
          taskId={viewingDiffTask.id}
          taskName={`${viewingDiffTask.scraper_name} - ${viewingDiffTask.enricher_ids.length} enricher${viewingDiffTask.enricher_ids.length !== 1 ? 's' : ''}`}
          onClose={() => setViewingDiffTask(null)}
        />
      )}
    </div>
  );
}
