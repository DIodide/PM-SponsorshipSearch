import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from 'react';
import { cn, formatRelativeTime, formatNumber, formatCurrency } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Search01Icon,
  FilterIcon,
  SortingAZ01Icon,
  Link01Icon,
  Cancel01Icon,
  SparklesIcon,
  Loading03Icon,
  Tick01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  InformationCircleIcon,
  Location01Icon,
  UserMultiple02Icon,
  HeartCheckIcon,
  Building03Icon,
  DollarCircleIcon,
  Tag01Icon,
  Settings02Icon,
  SourceCodeIcon,
  Copy01Icon,
  Download01Icon,
  CloudUploadIcon,
} from '@hugeicons/core-free-icons';
import type { DataResponse, TeamData, SponsorInfo } from '@/types';
import { METRIC_GROUPS, FIELD_METADATA } from '@/types';
import { updateTeam, cleanRegions } from '@/lib/api';
import { EnrichmentPanel } from './EnrichmentPanel';
import { ConvexExportModal } from './ConvexExportModal';

// Map metric group icons
const GROUP_ICONS: Record<string, typeof InformationCircleIcon> = {
  info: InformationCircleIcon,
  map: Location01Icon,
  users: UserMultiple02Icon,
  heart: HeartCheckIcon,
  building: Building03Icon,
  dollar: DollarCircleIcon,
  tag: Tag01Icon,
};

interface DataViewerProps {
  data: DataResponse | null;
  loading: boolean;
  onClose: () => void;
  onDataChange?: () => void; // Callback to refresh data after edits
}

// Editable fields configuration
const EDITABLE_FIELDS: (keyof TeamData)[] = ['name', 'region', 'league', 'category', 'target_demographic'];

interface EditingCell {
  rowIndex: number;
  field: keyof TeamData;
  value: string;
}

// Helper to format field values based on metadata
function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  
  const meta = FIELD_METADATA[field];
  if (!meta) return String(value);
  
  switch (meta.format) {
    case 'number':
      return typeof value === 'number' ? formatNumber(value) : String(value);
    case 'currency':
      return typeof value === 'number' ? formatCurrency(value) : String(value);
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'list':
    case 'tags':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'sponsors':
      if (Array.isArray(value)) {
        return value.map((s: SponsorInfo) => s.name).join(', ');
      }
      return String(value);
    default:
      return String(value);
  }
}

// Check if a team has enriched data for a specific group
function hasEnrichedData(team: TeamData, groupId: string): boolean {
  const group = METRIC_GROUPS.find(g => g.id === groupId);
  if (!group || groupId === 'core') return true;
  
  return group.fields.some(field => {
    const value = team[field];
    return value !== null && value !== undefined;
  });
}

export function DataViewer({ data, loading, onClose, onDataChange }: DataViewerProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<keyof TeamData>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  
  // Editing state
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCleaningRegions, setIsCleaningRegions] = useState(false);
  const [cleanedCount, setCleanedCount] = useState<number | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  
  // Expanded team detail state
  const [expandedTeamIndex, setExpandedTeamIndex] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['geographic', 'social']));
  
  // Enrichment panel state
  const [showEnrichmentPanel, setShowEnrichmentPanel] = useState(false);
  
  // JSON viewer state
  const [showJsonViewer, setShowJsonViewer] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  
  // Convex export modal state
  const [showConvexExport, setShowConvexExport] = useState(false);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
    // Only trigger when the target cell (row or field) changes, 
    // NOT when the value inside changes.
  }, [editingCell?.rowIndex, editingCell?.field]);

  // Clear cleaned count after 3 seconds
  useEffect(() => {
    if (cleanedCount !== null) {
      const timer = setTimeout(() => setCleanedCount(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [cleanedCount]);

  const categories = useMemo(() => {
    if (!data?.teams) return [];
    const cats = new Set(data.teams.map(t => t.category));
    return Array.from(cats).sort();
  }, [data?.teams]);

  // Track original indices for filtered data
  const filteredTeamsWithIndex = useMemo(() => {
    if (!data?.teams) return [];
    
    let teams = data.teams.map((team, originalIndex) => ({ ...team, _originalIndex: originalIndex }));
    
    // Category filter
    if (categoryFilter !== 'all') {
      teams = teams.filter(t => t.category === categoryFilter);
    }
    
    // Search
    if (search) {
      const searchLower = search.toLowerCase();
      teams = teams.filter(t => 
        t.name.toLowerCase().includes(searchLower) ||
        t.region.toLowerCase().includes(searchLower) ||
        t.league.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort
    teams.sort((a, b) => {
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    
    return teams;
  }, [data?.teams, categoryFilter, search, sortField, sortDir]);

  const handleSort = (field: keyof TeamData) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Double-click to edit
  const handleCellDoubleClick = useCallback((originalIndex: number, field: keyof TeamData, currentValue: string) => {
    if (!EDITABLE_FIELDS.includes(field)) return;
    setEditingCell({ rowIndex: originalIndex, field, value: currentValue });
  }, []);

  // Save edit
  const handleSaveEdit = useCallback(async () => {
    if (!editingCell || !data?.scraper_id) return;
    
    setIsSaving(true);
    try {
      await updateTeam(data.scraper_id, editingCell.rowIndex, editingCell.field, editingCell.value);
      setEditingCell(null);
      onDataChange?.(); // Refresh data
    } catch (err) {
      console.error('Failed to save:', err);
      alert(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }, [editingCell, data?.scraper_id, onDataChange]);

  // Cancel edit
  const handleCancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  // Handle key press in edit input
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  // Clean regions with AI
  const handleCleanRegions = useCallback(async () => {
    if (!data?.scraper_id) return;
    
    if (!confirm('This will use AI to clean and reconcile all region names based on team names. Continue?')) {
      return;
    }
    
    setIsCleaningRegions(true);
    setCleanedCount(null);
    try {
      const result = await cleanRegions(data.scraper_id);
      setCleanedCount(result.updated_count);
      onDataChange?.(); // Refresh data
    } catch (err) {
      console.error('Failed to clean regions:', err);
      alert(err instanceof Error ? err.message : 'Failed to clean regions');
    } finally {
      setIsCleaningRegions(false);
    }
  }, [data?.scraper_id, onDataChange]);

  // Toggle metric group expansion
  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Handle enrichment completion
  const handleEnrichmentComplete = useCallback(() => {
    onDataChange?.();
  }, [onDataChange]);
  
  // Copy JSON to clipboard
  const handleCopyJson = useCallback(async () => {
    if (!data?.teams) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data.teams, null, 2));
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [data?.teams]);
  
  // Download JSON
  const handleDownloadJson = useCallback(() => {
    if (!data?.teams || !data.scraper_id) return;
    const blob = new Blob([JSON.stringify(data.teams, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.scraper_id}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data?.teams, data?.scraper_id]);

  // Toggle team detail expansion
  const toggleTeamDetail = useCallback((index: number) => {
    setExpandedTeamIndex(prev => prev === index ? null : index);
  }, []);

  // Render editable cell
  const renderEditableCell = (
    originalIndex: number,
    field: keyof TeamData,
    value: string,
    className?: string
  ) => {
    const isEditing = editingCell?.rowIndex === originalIndex && editingCell?.field === field;
    
    if (isEditing) {
      return (
        <input
          ref={editInputRef}
          type="text"
          value={editingCell.value}
          onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
          onKeyDown={handleEditKeyDown}
          onBlur={handleSaveEdit}
          disabled={isSaving}
          className={cn(
            "w-full px-2 py-1 -my-1 rounded border border-primary bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30",
            isSaving && "opacity-50"
          )}
        />
      );
    }
    
    return (
      <span
        className={cn("cursor-pointer hover:bg-muted/50 px-1 -mx-1 rounded transition-colors", className)}
        onDoubleClick={() => handleCellDoubleClick(originalIndex, field, value)}
        title="Double-click to edit"
      >
        {value}
      </span>
    );
  };

  // Only show full-page loading if we have no data at all.
  // Otherwise, keep showing the table while it refreshes in the background.
  if (loading && !data) {
    return (
      <div className="rounded-xl border bg-card p-8">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Loading data...
        </div>
      </div>
    );
  }

  if (!data || data.teams.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8">
        <div className="text-center text-muted-foreground">
          <p className="mb-2">No data available</p>
          <p className="text-sm">Run the scraper to fetch team data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg">Team Data</h3>
            <p className="text-sm text-muted-foreground">
              {data.count} teams • Last updated: {formatRelativeTime(data.last_updated)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <HugeiconsIcon 
              icon={Search01Icon} 
              size={16} 
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
            />
            <input
              type="text"
              placeholder="Search teams..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Category Filter */}
          <div className="relative">
            <HugeiconsIcon 
              icon={FilterIcon} 
              size={16} 
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="pl-9 pr-8 py-2 rounded-lg border bg-background text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results Count & Actions */}
        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {filteredTeamsWithIndex.length} of {data.count} teams
            <span className="ml-2 text-xs opacity-70">(double-click cells to edit, click row to expand)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowJsonViewer(!showJsonViewer)}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                showJsonViewer 
                  ? "bg-slate-700 text-white" 
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              <HugeiconsIcon icon={SourceCodeIcon} size={14} />
              {showJsonViewer ? 'Hide JSON' : 'View JSON'}
            </button>
            <button
              onClick={() => setShowConvexExport(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 transition-colors shadow-sm"
            >
              <HugeiconsIcon icon={CloudUploadIcon} size={14} />
              Export to Convex
            </button>
            <button
              onClick={() => setShowEnrichmentPanel(!showEnrichmentPanel)}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                showEnrichmentPanel 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-primary/10 text-primary hover:bg-primary/20"
              )}
            >
              <HugeiconsIcon icon={showEnrichmentPanel ? Settings02Icon : SparklesIcon} size={14} />
              {showEnrichmentPanel ? 'Hide Enrichment' : 'Enrich Data'}
            </button>
          </div>
        </div>
      </div>

      {/* Enrichment Panel */}
      {showEnrichmentPanel && (
        <div className="border-b">
          <EnrichmentPanel
            scraperId={data.scraper_id}
            teamsCount={data.count}
            onEnrichmentComplete={handleEnrichmentComplete}
            onClose={() => setShowEnrichmentPanel(false)}
          />
        </div>
      )}
      
      {/* JSON Viewer Panel */}
      {showJsonViewer && (
        <div className="border-b bg-slate-900 text-slate-100">
          {/* JSON Viewer Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={SourceCodeIcon} size={16} className="text-slate-400" />
              <span className="text-sm font-medium">Raw JSON Data</span>
              <span className="text-xs text-slate-500">({data.count} teams)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <HugeiconsIcon icon={jsonCopied ? Tick01Icon : Copy01Icon} size={12} />
                {jsonCopied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <HugeiconsIcon icon={Download01Icon} size={12} />
                Download
              </button>
            </div>
          </div>
          
          {/* JSON Content */}
          <div className="max-h-[400px] overflow-auto">
            <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(data.teams, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="data-table">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-8"></th>
              <th className="w-12">Logo</th>
              <th 
                className="cursor-pointer hover:bg-muted/70"
                onClick={() => handleSort('name')}
              >
                <span className="inline-flex items-center gap-1">
                  Name
                  {sortField === 'name' && (
                    <HugeiconsIcon icon={SortingAZ01Icon} size={12} className={sortDir === 'desc' ? 'rotate-180' : ''} />
                  )}
                </span>
              </th>
              <th className="!pr-2">
                <div className="flex items-center gap-2">
                  <span 
                    className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                    onClick={() => handleSort('region')}
                  >
                    Region
                    {sortField === 'region' && (
                      <HugeiconsIcon icon={SortingAZ01Icon} size={12} className={sortDir === 'desc' ? 'rotate-180' : ''} />
                    )}
                  </span>
                  <button
                    onClick={handleCleanRegions}
                    disabled={isCleaningRegions}
                    className={cn(
                      "p-1 rounded hover:bg-muted transition-colors",
                      isCleaningRegions && "opacity-50 cursor-not-allowed"
                    )}
                    title="Clean regions with AI"
                  >
                    {isCleaningRegions ? (
                      <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
                    ) : cleanedCount !== null ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <HugeiconsIcon icon={Tick01Icon} size={12} />
                        {cleanedCount}
                      </span>
                    ) : (
                      <HugeiconsIcon icon={SparklesIcon} size={14} className="text-muted-foreground hover:text-foreground" />
                    )}
                  </button>
                </div>
              </th>
              <th 
                className="cursor-pointer hover:bg-muted/70"
                onClick={() => handleSort('league')}
              >
                <span className="inline-flex items-center gap-1">
                  League
                  {sortField === 'league' && (
                    <HugeiconsIcon icon={SortingAZ01Icon} size={12} className={sortDir === 'desc' ? 'rotate-180' : ''} />
                  )}
                </span>
              </th>
              <th 
                className="cursor-pointer hover:bg-muted/70"
                onClick={() => handleSort('category')}
              >
                <span className="inline-flex items-center gap-1">
                  Category
                  {sortField === 'category' && (
                    <HugeiconsIcon icon={SortingAZ01Icon} size={12} className={sortDir === 'desc' ? 'rotate-180' : ''} />
                  )}
                </span>
              </th>
              <th>Demographics</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {filteredTeamsWithIndex.map((team) => {
              const isExpanded = expandedTeamIndex === team._originalIndex;
              const enrichedGroupCount = METRIC_GROUPS.filter(g => g.id !== 'core' && hasEnrichedData(team, g.id)).length;
              
              return (
                <Fragment key={`${team.name}-${team._originalIndex}`}>
                  <tr 
                    className={cn(isExpanded && "bg-muted/30")}
                  >
                    <td className="w-8">
                      <button
                        onClick={() => toggleTeamDetail(team._originalIndex)}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title={isExpanded ? "Collapse" : "Expand to view more metrics"}
                      >
                        <HugeiconsIcon 
                          icon={isExpanded ? ArrowUp01Icon : ArrowDown01Icon} 
                          size={14} 
                          className="text-muted-foreground"
                        />
                      </button>
                    </td>
                    <td className="w-12">
                      {team.logo_url ? (
                        <img 
                          src={team.logo_url} 
                          alt={`${team.name} logo`}
                          className="w-8 h-8 object-contain rounded"
                          loading="lazy"
                          onError={(e) => {
                            // Hide broken images
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-8 h-8 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs">
                          —
                        </div>
                      )}
                    </td>
                    <td className="font-medium">
                      <div className="flex items-center gap-2">
                        {renderEditableCell(team._originalIndex, 'name', team.name)}
                        {enrichedGroupCount > 0 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                            +{enrichedGroupCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {renderEditableCell(team._originalIndex, 'region', team.region)}
                    </td>
                    <td className="text-muted-foreground">
                      {renderEditableCell(team._originalIndex, 'league', team.league)}
                    </td>
                    <td>
                      <span 
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded text-xs font-medium cursor-pointer hover:opacity-80',
                          team.category === 'MLB' || team.category === 'NBA' || team.category === 'NFL' || team.category === 'Major'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        )}
                        onDoubleClick={() => handleCellDoubleClick(team._originalIndex, 'category', team.category)}
                        title="Double-click to edit"
                      >
                        {editingCell?.rowIndex === team._originalIndex && editingCell?.field === 'category' ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onKeyDown={handleEditKeyDown}
                            onBlur={handleSaveEdit}
                            disabled={isSaving}
                            className="w-20 px-1 bg-transparent border-b border-current focus:outline-none"
                          />
                        ) : (
                          team.category
                        )}
                      </span>
                    </td>
                    <td className="text-sm text-muted-foreground max-w-xs truncate" title={team.target_demographic}>
                      {renderEditableCell(team._originalIndex, 'target_demographic', team.target_demographic)}
                    </td>
                    <td>
                      <a
                        href={team.official_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <HugeiconsIcon icon={Link01Icon} size={12} />
                        View
                      </a>
                    </td>
                  </tr>
                  
                  {/* Expanded detail row */}
                  {isExpanded && (
                    <tr key={`${team.name}-${team._originalIndex}-detail`} className="bg-muted/20">
                      <td colSpan={8} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {METRIC_GROUPS.filter(g => g.id !== 'core').map(group => {
                            const GroupIcon = GROUP_ICONS[group.icon] || InformationCircleIcon;
                            const isGroupExpanded = expandedGroups.has(group.id);
                            const hasData = hasEnrichedData(team, group.id);
                            
                            return (
                              <div 
                                key={group.id}
                                className={cn(
                                  "rounded-lg border bg-card overflow-hidden",
                                  !hasData && "opacity-60"
                                )}
                              >
                                <button
                                  onClick={() => toggleGroup(group.id)}
                                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <HugeiconsIcon 
                                      icon={GroupIcon} 
                                      size={16} 
                                      className={hasData ? "text-primary" : "text-muted-foreground"}
                                    />
                                    <span className="font-medium text-sm">{group.label}</span>
                                    {!hasData && (
                                      <span className="text-xs text-muted-foreground">(not enriched)</span>
                                    )}
                                  </div>
                                  <HugeiconsIcon 
                                    icon={isGroupExpanded ? ArrowUp01Icon : ArrowDown01Icon} 
                                    size={14} 
                                    className="text-muted-foreground"
                                  />
                                </button>
                                
                                {isGroupExpanded && (
                                  <div className="p-3 pt-0 space-y-2 border-t">
                                    {group.fields.map(field => {
                                      const value = team[field];
                                      const meta = FIELD_METADATA[field];
                                      
                                      return (
                                        <div key={field} className="flex justify-between items-start text-sm">
                                          <span className="text-muted-foreground">
                                            {meta?.label || field}
                                          </span>
                                          <span className={cn(
                                            "font-medium text-right max-w-[60%]",
                                            value === null || value === undefined ? "text-muted-foreground" : ""
                                          )}>
                                            {formatFieldValue(field, value)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Enrichment metadata */}
                        {team.enrichments_applied && team.enrichments_applied.length > 0 && (
                          <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
                            <span className="font-medium">Enrichments applied:</span>{' '}
                            {team.enrichments_applied.join(', ')}
                            {team.last_enriched && (
                              <span className="ml-2">
                                • Last enriched: {formatRelativeTime(team.last_enriched)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Convex Export Modal */}
      <ConvexExportModal
        scraperId={data.scraper_id}
        scraperName={data.scraper_id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        isOpen={showConvexExport}
        onClose={() => setShowConvexExport(false)}
        onExportComplete={onDataChange}
      />
    </div>
  );
}

