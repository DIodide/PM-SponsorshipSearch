import { cn } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  Loading03Icon,
  MinusSignCircleIcon,
} from '@hugeicons/core-free-icons';

interface StatusBadgeProps {
  status: 'idle' | 'running' | 'success' | 'failed';
  className?: string;
}

const statusConfig = {
  idle: {
    icon: MinusSignCircleIcon,
    label: 'Idle',
    className: 'bg-muted text-muted-foreground',
  },
  running: {
    icon: Loading03Icon,
    label: 'Running',
    className: 'bg-blue-100 text-blue-700',
  },
  success: {
    icon: CheckmarkCircle02Icon,
    label: 'Success',
    className: 'bg-green-100 text-green-700',
  },
  failed: {
    icon: AlertCircleIcon,
    label: 'Failed',
    className: 'bg-red-100 text-red-700',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        config.className,
        status === 'running' && 'status-running relative',
        className
      )}
    >
      <HugeiconsIcon 
        icon={config.icon} 
        size={14} 
        className={cn(status === 'running' && 'animate-spin')}
      />
      {config.label}
    </span>
  );
}

