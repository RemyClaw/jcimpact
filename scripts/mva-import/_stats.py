#!/usr/bin/env python3
"""
Shared stats regenerator for data.json.

Call `regenerate_stats(data)` after mutating data['incidents']. It recomputes
every derived field (citywide totals, per-district aggregates, monthlyTrends)
from the incidents list, so there's no drift between subsets.

Why this exists as a shared module: we had multiple copies of this logic
across scripts/mva-import/*.py, and one of them only recomputed mvas/thefts/
stolen for byDistrict — which caused byDistrict.totalCrimes and
byDistrict.shootings to drift out of sync with citywide after weeks of imports.
"""
from collections import defaultdict


SHOOTING_TYPES = ('Shots Fired', 'Shooting Hit')


def regenerate_stats(data: dict) -> None:
    """Recompute all derived stat fields in-place from data['incidents']."""
    incidents = data['incidents']

    # citywide
    cw = data['citywide']
    cw['totalCrimes']      = len(incidents)
    cw['mvas']             = sum(1 for i in incidents if i['type'] == 'MVA')
    cw['thefts']           = sum(1 for i in incidents if i['type'] == 'Theft')
    cw['stolenVehicles']   = sum(1 for i in incidents if i['type'] == 'Stolen Vehicle')
    cw['shootings']        = sum(1 for i in incidents if i['type'] in SHOOTING_TYPES)
    cw['trafficStops']     = sum(1 for i in incidents if i['type'] == 'Traffic Stop')
    cw['pedestrianStruck'] = sum(1 for i in incidents if i['type'] == 'Pedestrian Struck')
    # homicides stays as-is (not currently derived from incidents)

    # byDistrict — recompute every field, not just some
    per_district = defaultdict(lambda: {
        'totalCrimes': 0, 'shootings': 0, 'homicides': 0,
        'mvas': 0, 'thefts': 0, 'stolenVehicles': 0,
        'trafficStops': 0, 'pedestrianStruck': 0,
    })
    for i in incidents:
        dname = i['district']
        d = per_district[dname]
        d['totalCrimes'] += 1
        t = i['type']
        if t == 'MVA':                       d['mvas'] += 1
        elif t == 'Theft':                   d['thefts'] += 1
        elif t == 'Stolen Vehicle':          d['stolenVehicles'] += 1
        elif t == 'Traffic Stop':            d['trafficStops'] += 1
        elif t == 'Pedestrian Struck':       d['pedestrianStruck'] += 1
        elif t in SHOOTING_TYPES:            d['shootings'] += 1

    for b in data['byDistrict']:
        src = per_district.get(b['district'], {})
        # Preserve any fields on `b` we didn't recompute (e.g. homicides if
        # the dashboard ever adds them).
        for field in ('totalCrimes', 'shootings', 'mvas', 'thefts',
                      'stolenVehicles', 'trafficStops', 'pedestrianStruck'):
            b[field] = src.get(field, 0)

    # monthlyTrends — rebuild from scratch, preserving labels
    existing_labels = {m['month']: m['label'] for m in data.get('monthlyTrends', [])}
    by_month = defaultdict(lambda: {
        'totalCrimes': 0, 'shootings': 0, 'homicides': 0,
        'mvas': 0, 'thefts': 0, 'stolenVehicles': 0,
        'trafficStops': 0, 'pedestrianStruck': 0,
    })
    for i in incidents:
        k = i['date'][:7]
        m = by_month[k]
        m['totalCrimes'] += 1
        t = i['type']
        if t == 'MVA':                       m['mvas'] += 1
        elif t == 'Theft':                   m['thefts'] += 1
        elif t == 'Stolen Vehicle':          m['stolenVehicles'] += 1
        elif t == 'Traffic Stop':            m['trafficStops'] += 1
        elif t == 'Pedestrian Struck':       m['pedestrianStruck'] += 1
        elif t in SHOOTING_TYPES:            m['shootings'] += 1

    data['monthlyTrends'] = [
        {'month': k, 'label': existing_labels.get(k, k), **by_month[k]}
        for k in sorted(by_month.keys())
    ]
