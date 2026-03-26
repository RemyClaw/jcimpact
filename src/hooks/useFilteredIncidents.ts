import { useMemo } from 'react';
import { Incident, FilterState } from '@/types';

export function useFilteredIncidents(all: Incident[], filter: FilterState): Incident[] {
  return useMemo(() => {
    return all.filter((inc) => {
      // Type filter — empty array means show nothing (all toggles off)
      if (filter.incidentTypes.length === 0) return false;
      if (!filter.incidentTypes.includes(inc.type)) return false;

      // District filter
      if (filter.district !== 'All' && inc.district !== filter.district) return false;

      return true;
    });
  }, [all, filter.incidentTypes, filter.district]);
}
