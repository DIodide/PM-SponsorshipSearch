import { useState } from 'react';
import { cn, formatDuration, formatRelativeTime } from '@/lib/utils';
import { getDownloadUrl } from '@/lib/api';
import { StatusBadge } from './StatusBadge';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  PlayIcon,
  Download01Icon,
  Link01Icon,
  Clock01Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  Database01Icon,
  FileExportIcon,
} from '@hugeicons/core-free-icons';
import type { ScraperInfo } from '@/types';

interface ScraperCardProps {
  scraper: ScraperInfo;
  onRun: (id: string) => Promise<void>;
  onViewData: (id: string) => void;
  isSelected?: boolean;
}

export function ScraperCard({ scraper, onRun, onViewData, isSelected }: ScraperCardProps) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      await onRun(scraper.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run scraper');
    } finally {
      setRunning(false);
    }
  };

  const isRunning = scraper.status === 'running' || running;
  const successRate = scraper.total_runs > 0 
    ? Math.round((scraper.successful_runs / scraper.total_runs) * 100) 
    : 0;

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-6 transition-all duration-200',
        isSelected ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md',
        isRunning && 'border-blue-300'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-semibold text-lg truncate">{scraper.name}</h3>
            <StatusBadge status={scraper.status} />
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {scraper.description}
          </p>
        </div>
      </div>

      {/* Source Link */}
      <a
        href={scraper.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <HugeiconsIcon icon={Link01Icon} size={12} />
        {scraper.source_url}
      </a>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">{scraper.last_teams_count}</div>
          <div className="text-xs text-muted-foreground">Teams</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">{scraper.total_runs}</div>
          <div className="text-xs text-muted-foreground">Runs</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">{successRate}%</div>
          <div className="text-xs text-muted-foreground">Success</div>
        </div>
      </div>

      {/* Last Run Info */}
      <div className="space-y-2 mb-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <HugeiconsIcon icon={Clock01Icon} size={14} />
          <span>Last run: {formatRelativeTime(scraper.last_run)}</span>
          {scraper.last_duration_ms > 0 && (
            <span className="text-xs">({formatDuration(scraper.last_duration_ms)})</span>
          )}
        </div>
        
        {scraper.last_success && (
          <div className="flex items-center gap-2 text-green-600">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
            <span>Last success: {formatRelativeTime(scraper.last_success)}</span>
          </div>
        )}
        
        {scraper.last_error && (
          <div className="flex items-center gap-2 text-red-600">
            <HugeiconsIcon icon={AlertCircleIcon} size={14} />
            <span className="truncate" title={scraper.last_error}>
              Error: {scraper.last_error}
            </span>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleRun}
          disabled={isRunning}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <HugeiconsIcon 
            icon={PlayIcon} 
            size={16} 
            className={cn(isRunning && 'animate-pulse')}
          />
          {isRunning ? 'Running...' : 'Run Now'}
        </button>
        
        <button
          onClick={() => onViewData(scraper.id)}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            'border border-border hover:bg-muted',
            isSelected && 'bg-muted'
          )}
        >
          <HugeiconsIcon icon={Database01Icon} size={16} />
          View Data
        </button>

        <div className="flex gap-1 ml-auto">
          <a
            href={getDownloadUrl(scraper.id, 'json')}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              'border border-border hover:bg-muted',
              scraper.last_teams_count === 0 && 'opacity-50 pointer-events-none'
            )}
            title="Download JSON"
          >
            <HugeiconsIcon icon={Download01Icon} size={14} />
            JSON
          </a>
          <a
            href={getDownloadUrl(scraper.id, 'xlsx')}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              'border border-border hover:bg-muted',
              scraper.last_teams_count === 0 && 'opacity-50 pointer-events-none'
            )}
            title="Download Excel"
          >
            <HugeiconsIcon icon={FileExportIcon} size={14} />
            Excel
          </a>
        </div>
      </div>
    </div>
  );
}

