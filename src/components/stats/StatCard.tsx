'use client';

import { motion } from 'framer-motion';
import NumberFlow from '@number-flow/react';

interface StatCardProps {
  label: string;
  value: number;
  color: string;
  critical?: boolean;
  trend?: 'up' | 'down' | null;
  index?: number;
}

export default function StatCard({ label, value, color, critical, trend, index = 0 }: StatCardProps) {
  return (
    <motion.div
      className="flex-1 flex flex-col justify-center py-1.5 px-3 min-w-0 relative"
      style={{
        border: '2px solid #c8a96b',
        background: '#0a1628',
        borderRadius: '12px',
      }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
    >
      {/* Label */}
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] mb-1" style={{ color: '#FFFFFF' }}>
        {label}
      </div>

      {/* Value — always white */}
      <div className="text-base font-bold tabular-nums font-mono leading-none text-white">
        <NumberFlow value={value} />
      </div>

      {/* Trend badge — green for increase, red for decrease */}
      {trend && !(critical && value === 0) && (
        <div
          className="flex items-center gap-0.5 mt-1.5"
          style={{ color: trend === 'up' ? '#22C55E' : '#EF4444' }}
        >
          <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 10 10" fill="currentColor">
            {trend === 'down'
              ? <path d="M5 8L1 3h8z"/>
              : <path d="M5 2l4 5H1z"/>
            }
          </svg>
          <span className="text-[8px] font-bold tracking-widest uppercase">
            {trend === 'down' ? 'Decrease' : 'Increase'}
          </span>
        </div>
      )}
    </motion.div>
  );
}
