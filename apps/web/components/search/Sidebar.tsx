"use client";

import { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { 
  Clock01Icon, 
  Search01Icon, 
  Add01Icon,
  Delete01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import type { SearchFilters } from "@/app/page";

export interface SearchHistory {
  id: string;
  query: string;
  filters: SearchFilters;
  timestamp: number;
  resultsCount?: number;
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  history: SearchHistory[];
  onSelectHistory: (item: SearchHistory) => void;
  onClearHistory: () => void;
  onNewSearch: () => void;
  currentQuery?: string;
}

export function Sidebar({ 
  isOpen, 
  onToggle, 
  history, 
  onSelectHistory, 
  onClearHistory,
  onNewSearch,
  currentQuery,
}: SidebarProps) {
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const truncateQuery = (query: string, maxLength = 30) => {
    if (query.length <= maxLength) return query;
    return query.slice(0, maxLength) + "...";
  };

  const getFilterSummary = (filters: SearchFilters) => {
    const parts: string[] = [];
    if (filters.regions?.length) parts.push(`${filters.regions.length} region${filters.regions.length > 1 ? 's' : ''}`);
    if (filters.leagues?.length) parts.push(`${filters.leagues.length} league${filters.leagues.length > 1 ? 's' : ''}`);
    if (filters.budgetMin || filters.budgetMax) parts.push('budget');
    if (filters.demographics?.length) parts.push(`${filters.demographics.length} demo${filters.demographics.length > 1 ? 's' : ''}`);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  return (
    <>
      {/* Sidebar */}
      <aside 
        className={`fixed left-0 top-0 h-full bg-card border-r border-border z-40 transition-all duration-300 ease-in-out ${
          isOpen ? "w-64" : "w-0"
        } overflow-hidden`}
      >
        <div className="flex flex-col h-full w-64">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-foreground flex items-center justify-center">
                <span className="text-background font-bold text-xs">PM</span>
              </div>
              <span className="font-medium text-sm">Search History</span>
            </div>
          </div>

          {/* New Search Button */}
          <div className="p-3">
            <Button 
              onClick={onNewSearch}
              variant="outline" 
              className="w-full justify-start gap-2 text-sm"
            >
              <HugeiconsIcon icon={Add01Icon} size={16} />
              New Search
            </Button>
          </div>

          {/* History List */}
          <div className="flex-1 overflow-y-auto">
            {history.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                <HugeiconsIcon icon={Clock01Icon} size={24} className="mx-auto mb-2 opacity-50" />
                <p>No search history yet</p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectHistory(item)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      currentQuery === item.query 
                        ? "bg-muted" 
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <HugeiconsIcon 
                        icon={Search01Icon} 
                        size={14} 
                        className="text-muted-foreground mt-0.5 flex-shrink-0" 
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {truncateQuery(item.query || "Filtered Search")}
                        </p>
                        <div className="flex flex-col gap-0.5 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {formatTime(item.timestamp)}
                            {item.resultsCount !== undefined && ` • ${item.resultsCount} results`}
                          </span>
                          {!item.query && getFilterSummary(item.filters) && (
                            <span className="text-xs text-muted-foreground/80">
                              {getFilterSummary(item.filters)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clear History */}
          {history.length > 0 && (
            <div className="p-3 border-t border-border">
              <button
                onClick={onClearHistory}
                className="w-full text-left p-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2"
              >
                <HugeiconsIcon icon={Delete01Icon} size={14} />
                Clear history
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className={`fixed top-1/2 -translate-y-1/2 z-50 w-6 h-12 bg-card border border-border rounded-r-lg flex items-center justify-center hover:bg-muted transition-all duration-300 ${
          isOpen ? "left-64" : "left-0"
        }`}
      >
        <HugeiconsIcon 
          icon={isOpen ? ArrowLeft01Icon : ArrowRight01Icon} 
          size={14} 
          className="text-muted-foreground"
        />
      </button>
    </>
  );
}

