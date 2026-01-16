import { useState, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  SparklesIcon,
  Loading03Icon,
  Tick01Icon,
  Cancel01Icon,
  InformationCircleIcon,
  Location01Icon,
  UserMultiple02Icon,
  HeartCheckIcon,
  Building03Icon,
  DollarCircleIcon,
  Tag01Icon,
  CheckmarkSquare01Icon,
  SquareIcon,
  Alert01Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons';
import type { EnricherInfo, EnrichmentResult, TeamData } from '@/types';
import { FIELD_METADATA, ENRICHER_TO_GROUP } from '@/types';
import { fetchEnrichers, runEnrichment, fetchEnrichmentStatus, EnrichmentStatus } from '@/lib/api';

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

interface EnrichmentPanelProps {
  scraperId: string;
  teamsCount: number;
  onEnrichmentComplete?: () => void;
  onClose?: () => void;
}

type EnricherStatus = 'idle' | 'running' | 'success' | 'failed';

interface EnricherState {
  info: EnricherInfo;
  selected: boolean;
  status: EnricherStatus;
  result?: EnrichmentResult;
  appliedCount?: number; // How many teams already have this enrichment
}

export function EnrichmentPanel({ 
  scraperId, 
  teamsCount,
  onEnrichmentComplete, 
  onClose 
}: EnrichmentPanelProps) {
  const [enrichers, setEnrichers] = useState<EnricherState[]>([]);
  const [enrichmentStatus, setEnrichmentStatus] = useState<EnrichmentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load enrichers and status on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [enricherList, status] = await Promise.all([
          fetchEnrichers(),
          fetchEnrichmentStatus(scraperId),
        ]);
        
        setEnrichmentStatus(status);
        
        // Initialize enricher states with applied counts
        setEnrichers(enricherList.map(info => ({
          info,
          selected: info.available, // Pre-select available enrichers
          status: 'idle' as EnricherStatus,
          appliedCount: status.enrichments?.[info.id] || 0,
        })));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load enrichers');
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [scraperId]);

  const toggleEnricher = useCallback((enricherId: string) => {
    setEnrichers(prev => prev.map(e => 
      e.info.id === enricherId ? { ...e, selected: !e.selected } : e
    ));
  }, []);

  const selectAll = useCallback(() => {
    setEnrichers(prev => prev.map(e => ({
      ...e,
      selected: e.info.available,
    })));
  }, []);

  const selectNone = useCallback(() => {
    setEnrichers(prev => prev.map(e => ({ ...e, selected: false })));
  }, []);

  const selectedCount = useMemo(() => 
    enrichers.filter(e => e.selected && e.info.available).length,
    [enrichers]
  );

  const handleRunEnrichment = useCallback(async () => {
    const selectedIds = enrichers
      .filter(e => e.selected && e.info.available)
      .map(e => e.info.id);
    
    if (selectedIds.length === 0) return;
    
    setIsRunning(true);
    setError(null);
    
    // Set all selected enrichers to running
    setEnrichers(prev => prev.map(e => ({
      ...e,
      status: selectedIds.includes(e.info.id) ? 'running' as EnricherStatus : e.status,
      result: undefined,
    })));
    
    try {
      const results = await runEnrichment(scraperId, selectedIds);
      
      // Update enricher states with results
      setEnrichers(prev => prev.map(e => {
        const result = results.find(r => r.enricher_name.toLowerCase().includes(e.info.id));
        if (result) {
          return {
            ...e,
            status: result.success ? 'success' as EnricherStatus : 'failed' as EnricherStatus,
            result,
            appliedCount: result.success ? (e.appliedCount || 0) + result.teams_enriched : e.appliedCount,
          };
        }
        return e;
      }));
      
      // Refresh enrichment status
      const newStatus = await fetchEnrichmentStatus(scraperId);
      setEnrichmentStatus(newStatus);
      
      onEnrichmentComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrichment failed');
      // Reset status for selected enrichers
      setEnrichers(prev => prev.map(e => ({
        ...e,
        status: selectedIds.includes(e.info.id) ? 'failed' as EnricherStatus : e.status,
      })));
    } finally {
      setIsRunning(false);
    }
  }, [enrichers, scraperId, onEnrichmentComplete]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Loading enrichers...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <HugeiconsIcon icon={SparklesIcon} size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Data Enrichment</h3>
              <p className="text-sm text-muted-foreground">
                Select which data sources to add to {teamsCount} teams
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Quick select:</span>
          <button
            onClick={selectAll}
            className="text-primary hover:underline font-medium"
          >
            All available
          </button>
          <span className="text-muted-foreground">•</span>
          <button
            onClick={selectNone}
            className="text-primary hover:underline font-medium"
          >
            None
          </button>
        </div>
        <span className="text-sm text-muted-foreground">
          {selectedCount} of {enrichers.filter(e => e.info.available).length} selected
        </span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <HugeiconsIcon icon={Alert01Icon} size={16} />
          {error}
        </div>
      )}

      {/* Enricher List */}
      <div className="p-4 space-y-3">
        {enrichers.map(({ info, selected, status, result, appliedCount }) => {
          const Icon = ENRICHER_ICONS[info.id] || InformationCircleIcon;
          const isAvailable = info.available;
          const displayName = ENRICHER_NAMES[info.id] || info.name;
          const coverage = appliedCount && teamsCount > 0 
            ? Math.round((appliedCount / teamsCount) * 100) 
            : 0;
          
          return (
            <div
              key={info.id}
              className={cn(
                "rounded-lg border transition-all duration-200",
                selected && isAvailable && "border-primary bg-primary/5",
                !isAvailable && "opacity-60",
                status === 'running' && "border-primary/50 bg-primary/5",
                status === 'success' && "border-green-500 bg-green-50",
                status === 'failed' && "border-red-500 bg-red-50"
              )}
            >
              {/* Main Row */}
              <button
                onClick={() => isAvailable && toggleEnricher(info.id)}
                disabled={!isAvailable || isRunning}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-left",
                  isAvailable && !isRunning && "cursor-pointer hover:bg-muted/50",
                  !isAvailable && "cursor-not-allowed"
                )}
              >
                {/* Checkbox */}
                <div className={cn(
                  "w-5 h-5 rounded flex items-center justify-center transition-colors",
                  selected && isAvailable ? "bg-primary text-primary-foreground" : "border-2 border-muted-foreground/30"
                )}>
                  {selected && isAvailable && (
                    <HugeiconsIcon icon={Tick01Icon} size={12} />
                  )}
                </div>

                {/* Icon */}
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  status === 'running' && "bg-primary/20",
                  status === 'success' && "bg-green-100",
                  status === 'failed' && "bg-red-100",
                  status === 'idle' && (selected && isAvailable ? "bg-primary/10" : "bg-muted")
                )}>
                  {status === 'running' ? (
                    <HugeiconsIcon icon={Loading03Icon} size={18} className="text-primary animate-spin" />
                  ) : status === 'success' ? (
                    <HugeiconsIcon icon={Tick01Icon} size={18} className="text-green-600" />
                  ) : status === 'failed' ? (
                    <HugeiconsIcon icon={Cancel01Icon} size={18} className="text-red-600" />
                  ) : (
                    <HugeiconsIcon 
                      icon={Icon} 
                      size={18} 
                      className={selected && isAvailable ? "text-primary" : "text-muted-foreground"}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-medium",
                      !isAvailable && "text-muted-foreground"
                    )}>
                      {displayName}
                    </span>
                    {!isAvailable && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                        Not Available
                      </span>
                    )}
                    {coverage > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                        {coverage}% enriched
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {info.description}
                  </p>
                </div>

                {/* Status indicator / Field count */}
                <div className="text-right shrink-0">
                  {status === 'success' && result ? (
                    <div className="text-xs text-green-600">
                      <span className="font-medium">{result.teams_enriched}</span> teams
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">{info.fields_added.length}</span> fields
                    </div>
                  )}
                </div>
              </button>

              {/* Expanded Details - Fields */}
              {(selected || status !== 'idle') && (
                <div className="px-3 pb-3 pt-0 border-t border-dashed">
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {info.fields_added.map(field => {
                      const meta = FIELD_METADATA[field];
                      return (
                        <span
                          key={field}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground"
                        >
                          {meta?.label || field}
                        </span>
                      );
                    })}
                  </div>
                  
                  {/* Result Details */}
                  {result && (
                    <div className={cn(
                      "mt-2 text-xs",
                      result.success ? "text-green-600" : "text-red-600"
                    )}>
                      {result.success ? (
                        <span>
                          Processed {result.teams_processed} teams, enriched {result.teams_enriched} • 
                          {' '}{(result.duration_ms / 1000).toFixed(1)}s
                        </span>
                      ) : (
                        <span>Error: {result.error}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t bg-muted/30 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {enrichmentStatus?.has_data ? (
            <span>
              Current enrichment coverage: {' '}
              <span className="font-medium">
                {Object.keys(enrichmentStatus.enrichments || {}).length} sources
              </span>
            </span>
          ) : (
            <span>No data available to enrich</span>
          )}
        </div>
        
        <button
          onClick={handleRunEnrichment}
          disabled={selectedCount === 0 || isRunning || !enrichmentStatus?.has_data}
          className={cn(
            "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all",
            selectedCount > 0 && enrichmentStatus?.has_data && !isRunning
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {isRunning ? (
            <>
              <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" />
              Enriching...
            </>
          ) : (
            <>
              <HugeiconsIcon icon={SparklesIcon} size={16} />
              Run {selectedCount} Enricher{selectedCount !== 1 ? 's' : ''}
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
