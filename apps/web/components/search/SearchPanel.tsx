"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Settings02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import type { SearchFilters } from "@/app/page";

const REGIONS = [
  { value: "northeast", label: "Northeast" },
  { value: "southeast", label: "Southeast" },
  { value: "midwest", label: "Midwest" },
  { value: "southwest", label: "Southwest" },
  { value: "west", label: "West" },
];

const DEMOGRAPHICS = [
  { value: "families", label: "Families" },
  { value: "young-professionals", label: "Young Professionals" },
  { value: "millennials", label: "Millennials" },
  { value: "gen-z", label: "Gen Z" },
  { value: "affluent", label: "Affluent" },
  { value: "sports-enthusiasts", label: "Sports Enthusiasts" },
];

const BRAND_VALUES = [
  { value: "community", label: "Community" },
  { value: "performance", label: "Performance" },
  { value: "innovation", label: "Innovation" },
  { value: "tradition", label: "Tradition" },
  { value: "wellness", label: "Wellness" },
  { value: "sustainability", label: "Sustainability" },
  { value: "excellence", label: "Excellence" },
  { value: "family", label: "Family-Friendly" },
];

const LEAGUES = [
  { value: "NFL", label: "NFL" },
  { value: "NBA", label: "NBA" },
  { value: "MLB", label: "MLB" },
  { value: "NHL", label: "NHL" },
  { value: "MLS", label: "MLS" },
  { value: "WNBA", label: "WNBA" },
  { value: "USL", label: "USL" },
  { value: "Minor League", label: "Minor League" },
];

const GOALS = [
  { value: "awareness", label: "Brand Awareness" },
  { value: "trial", label: "Product Trial" },
  { value: "loyalty", label: "Customer Loyalty" },
  { value: "b2b", label: "B2B Relationships" },
  { value: "employer-brand", label: "Employer Brand" },
  { value: "local-presence", label: "Local Presence" },
];

interface SearchPanelProps {
  onSearch: (query: string, filters: SearchFilters) => void;
}

export function SearchPanel({ onSearch }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    regions: [],
    demographics: [],
    brandValues: [],
    leagues: [],
    goals: [],
  });

  const toggleFilter = (
    category: keyof Pick<SearchFilters, "regions" | "demographics" | "brandValues" | "leagues" | "goals">,
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
    const hasFilters = filters.regions.length > 0 || 
      filters.demographics.length > 0 || 
      filters.brandValues.length > 0 || 
      filters.leagues.length > 0 || 
      filters.goals.length > 0 ||
      filters.budgetMin !== undefined ||
      filters.budgetMax !== undefined;
    
    if (!query.trim() && !hasFilters) {
      return;
    }
    onSearch(query, filters);
  };

  const activeFilterCount =
    filters.regions.length +
    filters.demographics.length +
    filters.brandValues.length +
    filters.leagues.length +
    filters.goals.length +
    (filters.budgetMin ? 1 : 0) +
    (filters.budgetMax ? 1 : 0);

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {/* Main Search Input */}
      <div className="relative search-glow rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-3 p-4">
          <HugeiconsIcon icon={Search01Icon} size={22} className="text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe your ideal sponsorship... (e.g., 'Tech brand targeting millennials in the Southwest')"
            className="flex-1 bg-transparent text-base placeholder:text-muted-foreground focus:outline-none"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={showAdvanced ? "text-playmaker-blue" : "text-muted-foreground"}
          >
            <HugeiconsIcon icon={Settings02Icon} size={18} />
            <span className="ml-2 hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2 bg-playmaker-blue/10 text-playmaker-blue">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <div className="border-t border-border p-4 space-y-5 animate-slide-in-up">
            {/* Budget Range */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Budget Range</Label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Min ($)"
                    value={filters.budgetMin || ""}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        budgetMin: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                    className="bg-background"
                  />
                </div>
                <span className="text-muted-foreground">to</span>
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Max ($)"
                    value={filters.budgetMax || ""}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        budgetMax: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                    className="bg-background"
                  />
                </div>
              </div>
            </div>

            {/* Regions */}
            <FilterSection
              label="Regions"
              options={REGIONS}
              selected={filters.regions}
              onToggle={(value) => toggleFilter("regions", value)}
            />

            {/* Leagues */}
            <FilterSection
              label="Leagues"
              options={LEAGUES}
              selected={filters.leagues}
              onToggle={(value) => toggleFilter("leagues", value)}
            />

            {/* Target Demographics */}
            <FilterSection
              label="Target Demographics"
              options={DEMOGRAPHICS}
              selected={filters.demographics}
              onToggle={(value) => toggleFilter("demographics", value)}
            />

            {/* Brand Values */}
            <FilterSection
              label="Brand Values"
              options={BRAND_VALUES}
              selected={filters.brandValues}
              onToggle={(value) => toggleFilter("brandValues", value)}
            />

            {/* Goals */}
            <FilterSection
              label="Sponsorship Goals"
              options={GOALS}
              selected={filters.goals}
              onToggle={(value) => toggleFilter("goals", value)}
            />

            {/* Clear Filters */}
            {activeFilterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setFilters({
                    regions: [],
                    demographics: [],
                    brandValues: [],
                    leagues: [],
                    goals: [],
                  })
                }
                className="text-muted-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} className="mr-2" />
                Clear all filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Search Button */}
      <Button
        type="submit"
        size="lg"
        className="w-full mt-4 bg-playmaker-blue hover:bg-playmaker-blue/90 text-white font-medium"
        disabled={!query.trim() && activeFilterCount === 0}
      >
        <HugeiconsIcon icon={Search01Icon} size={18} className="mr-2" />
        Find Sponsorship Opportunities
      </Button>

      {/* Quick Search Suggestions */}
      <div className="mt-6 flex flex-wrap gap-2 justify-center">
        <span className="text-sm text-muted-foreground">Try:</span>
        {[
          "NFL teams in large markets",
          "Community-focused minor league teams",
          "NBA teams for Gen Z audience",
        ].map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              setQuery(suggestion);
            }}
            className="text-sm text-playmaker-blue hover:underline"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </form>
  );
}

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
      <Label className="text-sm font-medium mb-3 block">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Badge
            key={option.value}
            variant={selected.includes(option.value) ? "default" : "outline"}
            className={`cursor-pointer transition-colors ${
              selected.includes(option.value)
                ? "bg-playmaker-blue hover:bg-playmaker-blue/90 text-white border-transparent"
                : "hover:bg-accent/10 hover:border-playmaker-blue/50"
            }`}
            onClick={() => onToggle(option.value)}
          >
            {option.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}

