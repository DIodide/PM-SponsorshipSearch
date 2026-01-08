import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { cn, formatRelativeTime } from '@/lib/utils';
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
} from '@hugeicons/core-free-icons';
import type { DataResponse, TeamData } from '@/types';
import { updateTeam, cleanRegions } from '@/lib/api';

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

  if (loading) {
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

        {/* Results Count */}
        <div className="mt-3 text-sm text-muted-foreground">
          Showing {filteredTeamsWithIndex.length} of {data.count} teams
          <span className="ml-2 text-xs opacity-70">(double-click cells to edit)</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="data-table">
          <thead className="sticky top-0 z-10">
            <tr>
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
            {filteredTeamsWithIndex.map((team) => (
              <tr key={`${team.name}-${team._originalIndex}`}>
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
                  {renderEditableCell(team._originalIndex, 'name', team.name)}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

