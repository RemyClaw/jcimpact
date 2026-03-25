interface StatCardProps {
  label: string;
  value: number;
  accentColor: 'red' | 'amber' | 'blue' | 'slate' | 'green' | 'purple';
  sublabel?: string;
  icon: React.ReactNode;
}

const accent: Record<StatCardProps['accentColor'], { border: string; icon: string; num: string; bg: string }> = {
  red:    { border: 'border-accent-red/25',    icon: 'text-accent-red',    num: 'text-white', bg: 'bg-accent-red/8'    },
  amber:  { border: 'border-accent-amber/25',  icon: 'text-accent-amber',  num: 'text-white', bg: 'bg-accent-amber/8'  },
  blue:   { border: 'border-accent-blue/25',   icon: 'text-accent-blue',   num: 'text-white', bg: 'bg-accent-blue/8'   },
  green:  { border: 'border-accent-green/25',  icon: 'text-accent-green',  num: 'text-white', bg: 'bg-accent-green/8'  },
  purple: { border: 'border-accent-purple/25', icon: 'text-accent-purple', num: 'text-white', bg: 'bg-accent-purple/8' },
  slate:  { border: 'border-white/10',         icon: 'text-slate-400',     num: 'text-white', bg: 'bg-white/4'         },
};

export default function StatCard({ label, value, accentColor, sublabel, icon }: StatCardProps) {
  const cls = accent[accentColor];
  return (
    <div className={`flex items-center gap-3 bg-surface-card rounded-xl border ${cls.border} px-3.5 py-2.5 hover:bg-surface-elevated transition-colors`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${cls.bg} flex items-center justify-center ${cls.icon}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className={`text-xl font-bold tabular-nums leading-none ${cls.num}`}>
          {value.toLocaleString()}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5 leading-none truncate">{label}</div>
        {sublabel && (
          <div className="text-[9px] text-slate-600 mt-0.5 leading-none truncate">{sublabel}</div>
        )}
      </div>
    </div>
  );
}
