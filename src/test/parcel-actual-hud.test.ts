import { describe, it, expect } from 'vitest';
import { fmtAmount, fmtSigned, constructionTooltip } from '@/lib/hudFormat';
import { indexParcelProducers, parcelZeroReason, macroSummary, parcelIdOf } from '@/lib/parcelActual';

const U = (i: number) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;

describe('HUD tiny gains', () => {
  it('never shows a positive gain as +0.0', () => {
    expect(fmtSigned(0.0382)).toBe('+0.038');
    expect(fmtSigned(0.0004)).toBe('+0.0004');
    expect(fmtSigned(0)).toBe('+0');
    expect(fmtAmount(15.038)).toBe('15');
    expect(fmtAmount(3.24)).toBe('3.2');
  });
  it('tooltip names raw efficiencies and capacity is not income', () => {
    const t = constructionTooltip(0.0382, 37);
    expect(t).toContain('surové dřevo 0.2');
    expect(t).toContain('surový kámen 0.15');
    expect(t).toContain('37 je jen potenciál');
    expect(t).toContain('+0.038');
  });
});

describe('parcel actual output', () => {
  const producers = [
    { producer: `parcel:${U(1)}:fell_timber`, good: 'raw_timber', realized: 0.5, employed: 2, jobs_capacity: 3, parcel: { reservoir: 4 } },
    { producer: `parcel:${U(1)}:hunt_game`, good: 'game', realized: 0, employed: 0, jobs_capacity: 1, factors: { staffing: 0 } },
    { producer: 'node:x:bake', good: 'bread', realized: 9 },
  ];
  const idx = indexParcelProducers(producers);
  it('keys by stable parcel id only', () => {
    expect(parcelIdOf('node:x:bake')).toBeNull();
    expect(idx.get(U(1))?.length).toBe(2);
    expect(idx.size).toBe(1);
  });
  it('unclaimed, occupied and missing report explain zero', () => {
    expect(parcelZeroReason({ id: U(2), city_id: null, owner_player: null, status: 'wild' }, undefined, true)).toMatch(/nevlastněný/);
    expect(parcelZeroReason({ id: U(3), city_id: 'c', owner_player: 'P', status: 'occupied', land_use: 'commercial' }, undefined, true)).toMatch(/zastavěno/);
    expect(parcelZeroReason({ id: U(1), city_id: 'c', owner_player: 'P', status: 'claimed', land_use: 'open' }, idx.get(U(1)), false)).toMatch(/chybí uzavřený tah/);
    expect(parcelZeroReason({ id: U(1), city_id: 'c', owner_player: 'P', status: 'claimed', land_use: 'open' }, idx.get(U(1)), true)).toBeNull();
  });
  it('36-parcel macro square: realized only from owned, potential only from unclaimed', () => {
    const parcels = Array.from({ length: 36 }, (_, i) => ({ id: U(i + 1), city_id: i < 8 ? 'c' : null, owner_player: i < 8 ? 'P' : null, status: i < 8 ? 'claimed' : 'wild' }));
    const m = macroSummary(parcels, idx, () => 1);
    expect(m).toEqual({ ownedRealized: 0.5, ownedCount: 8, unclaimedPotential: 28, unclaimedCount: 28 });
  });
});
