import { useMemo } from 'react';
import { Incident, FilterState } from '@/types';

function parseLocalDate(dateStr: string): Date {
  // Parse "YYYY-MM-DD" as local date to avoid UTC offset issues
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function useFilteredIncidents(all: Incident[], filter: FilterState): Incident[] {
  return useMemo(() => {
    return all.filter((inc) => {
      // Type filter
      if (!filter.incidentTypes.includes(inc.type)) return false;

      // District filter
      if (filter.district !== 'All' && inc.district !== filter.district) return false;

      // Date range filter
      const { from, to } = filter.dateRange;
      if (from || to) {
        const incDate = parseLocalDate(inc.date);
        if (from && incDate < from) return false;
        if (to) {
          const toEnd = new Date(to);
          toEnd.setHours(23, 59, 59, 999);
          if (incDate > toEnd) return false;
        }
      }

      return true;
    });
  }, [all, filter]);
}
