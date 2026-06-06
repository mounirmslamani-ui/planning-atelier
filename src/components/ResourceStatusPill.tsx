import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ResourceStatus } from '@/types/planning';


interface Props {
  value: ResourceStatus | undefined;
  onChange?: (next: ResourceStatus) => void;
  size?: 'sm' | 'md';
  readOnly?: boolean;
}

const STATUS_META: Record<ResourceStatus, { emoji: string; label: string }> = {
  'disponible': { emoji: '🟢', label: 'Disponible' },
  'partiel': { emoji: '🟠', label: 'Disponible partiellement' },
  'non-disponible': { emoji: '🔴', label: 'Non disponible' },
  'non-applicable': { emoji: '⚪', label: 'Non applicable' },
};

const ORDER: ResourceStatus[] = ['disponible', 'partiel', 'non-disponible', 'non-applicable'];

const ResourceStatusPill: React.FC<Props> = ({ value, onChange, size = 'sm', readOnly = false }) => {
  const [open, setOpen] = React.useState(false);
  const current = value ?? 'non-disponible';
  const meta = STATUS_META[current];
  const cls = size === 'sm' ? 'text-sm' : 'text-base';

  // Mode lecture seule : affichage simple sans dropdown
  if (readOnly) {
    return (
      <span
        className={`${cls} select-none`}
        title={meta.label}
      >
        {meta.emoji}
      </span>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${cls} cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-ring rounded`}
          title={meta.label}
        >
          {meta.emoji}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[180px]">
        {ORDER.map(s => (
          <DropdownMenuItem
            key={s}
            onSelect={(event) => {
              event.preventDefault();
              if (current !== s && onChange) onChange(s);
              setOpen(false);
            }}
            className={current === s ? 'bg-accent' : ''}
          >
            <span className="mr-2">{STATUS_META[s].emoji}</span>
            <span className="text-xs">{STATUS_META[s].label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { STATUS_META as RESOURCE_STATUS_META };
export default ResourceStatusPill;
