export type IncidentType = 'MVA' | 'Shooting';

export type District =
  | 'North'
  | 'East'
  | 'South'
  | 'West';

export const ALL_DISTRICTS: District[] = ['North', 'East', 'South', 'West'];

export interface Incident {
  id: string;
  type: IncidentType;
  date: string; // ISO 8601: "2026-01-01"
  district: District;
  lat: number;
  lng: number;
  address: string;
  description?: string;
}

export interface DistrictStats {
  district: District;
  totalCrimes: number;
  shootings: number;
  homicides: number;
  mvas: number;
}

export interface MonthlyStat {
  month: string;  // "2026-01" for sorting
  label: string;  // "Jan '26" for display
  totalCrimes: number;
  shootings: number;
  homicides: number;
  mvas: number;
}

export interface SummaryStats {
  citywide: {
    totalCrimes: number;
    shootings: number;
    homicides: number;
    mvas: number;
  };
  byDistrict: DistrictStats[];
  monthlyTrends: MonthlyStat[];
}

export interface FilterState {
  dateRange: {
    from: Date | undefined;
    to: Date | undefined;
  };
  incidentTypes: IncidentType[];
  district: District | 'All';
}

export interface IncidentFeatureProperties {
  id: string;
  type: IncidentType;
  date: string;
  district: District;
  address: string;
  description?: string;
}
