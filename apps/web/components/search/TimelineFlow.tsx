"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { 
  CheckmarkCircle02Icon, 
  Loading02Icon,
  Link01Icon,
  AiSearch02Icon,
  Search01Icon,
  AnalyticsUpIcon,
  ChartLineData01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import type { ProgressStep } from "./ProgressSteps";

interface SourceUrl {
  url: string;
  title?: string;
  domain?: string;
}

interface TimelineNode {
  id: string;
  type: "step" | "source" | "team" | "info";
  label: string;
  status: "pending" | "active" | "completed";
  sublabel?: string;
  url?: string;
  domain?: string;
}

interface TimelineFlowProps {
  steps: ProgressStep[];
  sources: SourceUrl[];
  infoMessages: string[];
  isDiscoveryMode: boolean;
}

const STEP_ICONS: Record<string, typeof Search01Icon> = {
  analyze: AnalyticsUpIcon,
  search: Search01Icon,
  discover: AiSearch02Icon,
  evaluate: SparklesIcon,
  rank: ChartLineData01Icon,
  generate: SparklesIcon,
};

export function TimelineFlow({ steps, sources, infoMessages, isDiscoveryMode }: TimelineFlowProps) {
  // Build timeline nodes from steps, sources, and info
  const timelineNodes: TimelineNode[] = [];
  
  // Add steps
  steps.forEach((step) => {
    timelineNodes.push({
      id: `step-${step.id}`,
      type: "step",
      label: step.label.replace("...", ""),
      status: step.status,
    });
  });

  // If in discovery mode and we have sources, add them after the search step
  const searchStepIndex = timelineNodes.findIndex(n => n.id === "step-search");
  if (isDiscoveryMode && sources.length > 0 && searchStepIndex !== -1) {
    // Insert discovery header
    const discoveryNodes: TimelineNode[] = [
      {
        id: "discovery-header",
        type: "info",
        label: "AI Discovery Mode Activated",
        status: "completed",
        sublabel: "Searching external sources...",
      },
      ...sources.slice(0, 5).map((source, i) => ({
        id: `source-${i}`,
        type: "source" as const,
        label: source.title || source.domain || "Source",
        status: "completed" as const,
        url: source.url,
        domain: source.domain,
      })),
    ];
    
    // Insert after search step
    timelineNodes.splice(searchStepIndex + 1, 0, ...discoveryNodes);
  }

  return (
    <div className="relative">
      {timelineNodes.map((node, index) => (
        <TimelineNodeItem 
          key={node.id} 
          node={node} 
          isLast={index === timelineNodes.length - 1}
        />
      ))}
    </div>
  );
}

function TimelineNodeItem({ node, isLast }: { node: TimelineNode; isLast: boolean }) {
  const Icon = node.type === "step" 
    ? STEP_ICONS[node.id.replace("step-", "")] || SparklesIcon
    : node.type === "source"
    ? Link01Icon
    : AiSearch02Icon;

  return (
    <div className="relative flex items-start gap-4 pb-6">
      {/* Vertical Line */}
      {!isLast && (
        <div 
          className={`absolute left-[11px] top-6 w-0.5 h-full ${
            node.status === "completed" 
              ? "bg-border" 
              : node.status === "active"
              ? "bg-gradient-to-b from-foreground/50 to-border"
              : "bg-border/30"
          }`}
        />
      )}

      {/* Node Circle */}
      <div className="relative z-10 flex-shrink-0">
        {node.status === "completed" ? (
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
            {node.type === "source" ? (
              <HugeiconsIcon icon={Link01Icon} size={12} className="text-muted-foreground" />
            ) : (
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="text-muted-foreground" />
            )}
          </div>
        ) : node.status === "active" ? (
          <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center">
            <HugeiconsIcon icon={Loading02Icon} size={12} className="text-background animate-spin" />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full border-2 border-border bg-background" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 pt-0.5 ${
        node.status === "pending" ? "opacity-40" : ""
      }`}>
        {node.type === "source" ? (
          <a
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 text-sm hover:underline"
          >
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">
              {node.domain || node.label}
            </span>
            <HugeiconsIcon 
              icon={Link01Icon} 
              size={10} 
              className="text-muted-foreground/50 group-hover:text-muted-foreground" 
            />
          </a>
        ) : (
          <>
            <p className={`text-sm ${
              node.status === "active" ? "font-medium" : ""
            }`}>
              {node.label}
            </p>
            {node.sublabel && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {node.sublabel}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

