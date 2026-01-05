"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, Loading02Icon } from "@hugeicons/core-free-icons";

export type ProgressStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "completed";
};

interface ProgressStepsProps {
  steps: ProgressStep[];
}

export function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={`flex items-center gap-3 text-sm transition-opacity duration-300 ${
            step.status === "pending" ? "opacity-40" : "opacity-100"
          }`}
          style={{
            animationDelay: `${index * 100}ms`,
          }}
        >
          <StepIndicator status={step.status} />
          <span
            className={`${
              step.status === "active"
                ? "text-foreground font-medium"
                : step.status === "completed"
                ? "text-muted-foreground"
                : "text-muted-foreground"
            }`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function StepIndicator({ status }: { status: ProgressStep["status"] }) {
  if (status === "completed") {
    return (
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        size={18}
        className="text-green-500"
      />
    );
  }

  if (status === "active") {
    return (
      <div className="relative">
        <HugeiconsIcon
        icon={Loading02Icon}
        size={18}
        className="text-playmaker-blue animate-spin"
        />
      </div>
    );
  }

  return (
    <div className="w-[18px] h-[18px] rounded-full border-2 border-muted-foreground/30" />
  );
}

