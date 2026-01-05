"use client";

import { Badge } from "@/components/ui/badge";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Location01Icon,
  UserGroupIcon,
  MoneyBag01Icon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  Briefcase01Icon,
} from "@hugeicons/core-free-icons";

export type TeamRecommendation = {
  id: string;
  name: string;
  league: string;
  city: string;
  state: string;
  region: string;
  score: number;
  reasoning: string;
  pros: string[];
  cons: string[];
  demographics: {
    avgAge?: number;
    primaryAudience?: string[];
    incomeLevel?: string;
  };
  estimatedCost?: {
    min: number;
    max: number;
  };
  brandValues: string[];
  dealStructure?: {
    suggestedAssets: string[];
    activationIdeas: string[];
  };
};

interface TeamCardProps {
  team: TeamRecommendation;
  rank: number;
  isStreaming?: boolean;
}

export function TeamCard({ team, rank, isStreaming }: TeamCardProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value}`;
  };

  return (
    <div className="team-card rounded-xl border border-border bg-card p-6 animate-slide-in-up">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          {/* Rank Badge */}
          <div className="w-10 h-10 rounded-full bg-playmaker-blue/10 flex items-center justify-center">
            <span className="text-playmaker-blue font-bold">#{rank}</span>
          </div>

          <div>
            <h3 className="font-semibold text-lg">{team.name}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="text-xs">
                {team.league}
              </Badge>
              <span className="flex items-center gap-1">
                <HugeiconsIcon icon={Location01Icon} size={14} />
                {team.city}, {team.state}
              </span>
            </div>
          </div>
        </div>

        {/* Match Score */}
        <div className="text-right">
          <div className="text-2xl font-bold text-playmaker-blue">
            {Math.round(team.score)}%
          </div>
          <div className="text-xs text-muted-foreground">match</div>
        </div>
      </div>

      {/* Reasoning */}
      <p className={`text-sm text-muted-foreground mb-4 ${isStreaming ? "typing-cursor" : ""}`}>
        {team.reasoning}
      </p>

      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 p-4 rounded-lg bg-muted/30">
        {team.demographics.primaryAudience && team.demographics.primaryAudience.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <HugeiconsIcon icon={UserGroupIcon} size={14} />
              Audience
            </div>
            <div className="text-sm font-medium">
              {team.demographics.primaryAudience.slice(0, 2).join(", ")}
            </div>
          </div>
        )}

        {team.demographics.avgAge && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Avg. Age</div>
            <div className="text-sm font-medium">{team.demographics.avgAge}</div>
          </div>
        )}

        {team.estimatedCost && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <HugeiconsIcon icon={MoneyBag01Icon} size={14} />
              Est. Cost
            </div>
            <div className="text-sm font-medium">
              {formatCurrency(team.estimatedCost.min)} - {formatCurrency(team.estimatedCost.max)}
            </div>
          </div>
        )}

        {team.brandValues.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Values</div>
            <div className="text-sm font-medium">
              {team.brandValues.slice(0, 2).join(", ")}
            </div>
          </div>
        )}
      </div>

      {/* Pros and Cons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {/* Pros */}
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-green-600 mb-2">
            <HugeiconsIcon icon={ThumbsUpIcon} size={16} />
            Strengths
          </div>
          <ul className="space-y-1.5">
            {team.pros.map((pro, index) => (
              <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-green-500 mt-1">•</span>
                {pro}
              </li>
            ))}
          </ul>
        </div>

        {/* Cons */}
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-orange-600 mb-2">
            <HugeiconsIcon icon={ThumbsDownIcon} size={16} />
            Considerations
          </div>
          <ul className="space-y-1.5">
            {team.cons.map((con, index) => (
              <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                {con}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Deal Structure Preview */}
      {team.dealStructure && (
        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm font-medium mb-3">
            <HugeiconsIcon icon={Briefcase01Icon} size={16} className="text-playmaker-blue" />
            Potential Deal Structure
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {team.dealStructure.suggestedAssets.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">Suggested Assets</div>
                <div className="flex flex-wrap gap-1.5">
                  {team.dealStructure.suggestedAssets.map((asset, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {asset}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {team.dealStructure.activationIdeas.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">Activation Ideas</div>
                <div className="flex flex-wrap gap-1.5">
                  {team.dealStructure.activationIdeas.map((idea, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {idea}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

