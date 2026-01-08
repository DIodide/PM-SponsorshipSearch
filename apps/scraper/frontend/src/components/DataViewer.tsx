import { useState, useMemo } from 'react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Search01Icon,
  FilterIcon,
  SortingAZ01Icon,
  Link01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import type { DataResponse, TeamData } from '@/types';

interface DataViewerProps {
  data: DataResponse | null;
  loading: boolean;
  onClose: () => void;
}

export function DataViewer({ data, loading, onClose }: DataViewerProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<keyof TeamData>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const categories = useMemo(() => {
    if (!data?.teams) return [];
    const cats = new Set(data.teams.map(t => t.category));
    return Array.from(cats).sort();
  }, [data?.teams]);

  const filteredTeams = useMemo(() => {
    if (!data?.teams) return [];
    
    let teams = [...data.teams];
    
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
          Showing {filteredTeams.length} of {data.count} teams
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="data-table">
          <thead className="sticky top-0 z-10">
            <tr>
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
              <th 
                className="cursor-pointer hover:bg-muted/70"
                onClick={() => handleSort('region')}
              >
                <span className="inline-flex items-center gap-1">
                  Region
                  {sortField === 'region' && (
                    <HugeiconsIcon icon={SortingAZ01Icon} size={12} className={sortDir === 'desc' ? 'rotate-180' : ''} />
                  )}
                </span>
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
            {filteredTeams.map((team, index) => (
              <tr key={`${team.name}-${index}`}>
                <td className="font-medium">{team.name}</td>
                <td>{team.region}</td>
                <td className="text-muted-foreground">{team.league}</td>
                <td>
                  <span className={cn(
                    'inline-flex px-2 py-0.5 rounded text-xs font-medium',
                    team.category === 'MLB' || team.category === 'NBA' 
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
                  )}>
                    {team.category}
                  </span>
                </td>
                <td className="text-sm text-muted-foreground max-w-xs truncate" title={team.target_demographic}>
                  {team.target_demographic}
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

