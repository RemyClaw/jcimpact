'use client';

import { IncidentType } from '@/types';

interface IncidentTypeFilterProps {
  selected: IncidentType[];
  onChange: (next: IncidentType[]) => void;
}

const TYPES: { value: IncidentType; label: string; color: string; dot: string }[] = [
  { value: 'Shooting', label: 'Shootings',   color: 'text-accent-red',   dot: 'bg-accent-red'   },
  { value: 'MVA',      label: 'MVAs',         color: 'text-accent-amber', dot: 'bg-accent-amber' },
];

export default function IncidentTypeFilter({ selected, onChange }: IncidentTypeFilterProps) {
  function toggle(type: IncidentType) {
    if (selected.includes(type)) {
      if (selected.length === 1) return;
      onChange(selected.filter((t) => t !== type));
    } else {
      onChange([...selected, type]);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {TYPES.map(({ value, label, color, dot }) => {
        const checked = selected.includes(value);
        return (
          <button
            key={value}
            onClick={() => toggle(value)}
            className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-md border text-xs transition-all ${
              checked
                ? 'border-white/10 bg-white/5 ' + color
                : 'border-transparent text-slate-500 hover:text-slate-400 hover:bg-white/[0.03]'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-opacity ${dot} ${checked ? 'opacity-100' : 'opacity-30'}`} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
