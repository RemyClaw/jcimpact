'use client';

import { useState } from 'react';
import { DayPicker, DateRange } from 'react-day-picker';

interface DateRangePickerProps {
  from: Date | undefined;
  to: Date | undefined;
  onChange: (from: Date | undefined, to: Date | undefined) => void;
}

function fmt(d: Date | undefined) {
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const range: DateRange = { from, to };

  function handleSelect(r: DateRange | undefined) {
    onChange(r?.from, r?.to);
    if (r?.from && r?.to) setOpen(false);
  }

  const hasRange = from || to;
  const label = hasRange ? `${fmt(from) || '…'} – ${fmt(to) || '…'}` : 'All dates';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 bg-[#111827] border border-[#1F2937] text-xs px-3 py-2 text-left transition-colors hover:border-[#374151] focus:outline-none ${hasRange ? 'text-[#E5E7EB]' : 'text-[#9CA3AF]'}`}
      >
        {label}
        <svg className={`w-3.5 h-3.5 text-slate-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#111827] border border-[#1F2937] z-50 p-2">
            <DayPicker
              mode="range"
              selected={range}
              onSelect={handleSelect}
              numberOfMonths={1}
              showOutsideDays={false}
              defaultMonth={new Date(2026, 0)}
              fromDate={new Date(2026, 0, 1)}
              toDate={new Date(2026, 2, 21)}
              className="!p-0 text-xs"
            />
            {hasRange && (
              <button
                onClick={() => { onChange(undefined, undefined); setOpen(false); }}
                className="w-full mt-1 text-[11px] text-[#9CA3AF] hover:text-[#E5E7EB] py-1.5 hover:bg-white/5 transition-colors"
              >
                Clear dates
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
