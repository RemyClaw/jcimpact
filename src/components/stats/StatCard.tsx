interface StatCardProps {
  label: string;
  value: number;
  accentColor: 'red' | 'amber' | 'blue' | 'slate';
  sublabel?: string;
}

const accent = {
  red:   { bar: 'bg-accent-red',   num: 'text-white' },
  amber: { bar: 'bg-accent-amber', num: 'text-white' },
  blue:  { bar: 'bg-accent-blue',  num: 'text-white' },
  slate: { bar: 'bg-slate-500',    num: 'text-white' },
};

export default function StatCard({ label, value, accentColor, sublabel }: StatCardProps) {
  const cls = accent[accentColor];

  return (
    <div className="flex items-stretch gap-0 bg-white/[0.03] rounded-lg overflow-hidden border border-white/[0.06] hover:border-white/10 transition-colors">
      {/* Left accent bar */}
      <div className={`w-[3px] flex-shrink-0 ${cls.bar} opacity-80`} />

      <div className="flex flex-col justify-center px-3 py-2 min-w-0">
        <div className={`text-xl font-bold tabular-nums leading-none ${cls.num}`}>
          {value.toLocaleString()}
        </div>
        <div className="text-[11px] text-slate-400 mt-1 truncate leading-none">{label}</div>
        {sublabel && (
          <div className="text-[10px] text-slate-600 mt-0.5 truncate">{sublabel}</div>
        )}
      </div>
    </div>
  );
}
