import React from 'react';
import { Badge } from '@/components/ui/badge';
import { WarningTriangleIcon } from '@/components/icons/StatusIcons';
import type { OrderPriority } from '@/types/planning';

const priorityColors: Record<OrderPriority, string> = {
  P1: 'bg-urgent text-white',
  P2: 'bg-urgent-moderate text-white',
  P3: 'bg-priority-p3 text-foreground',
  P4: 'bg-priority-p4 text-foreground',
};

interface PriorityBadgeProps {
  priority?: OrderPriority | '' | null;
  className?: string;
}

const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, className = 'text-xs' }) => {
  if (!priority) {
    return (
      <span className="flex w-full items-center justify-center" title="Priorité non renseignée">
        <WarningTriangleIcon className="h-14 w-14" />
      </span>
    );
  }

  return <Badge className={`${priorityColors[priority]} ${className}`}>{priority}</Badge>;
};

export default PriorityBadge;