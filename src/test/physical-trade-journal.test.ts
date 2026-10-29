import { describe, expect, it } from 'vitest';
import { assertPhysicalTradeJournal } from '../../supabase/functions/_shared/physicalTradeJournal';

const balances = () => [
  { city: 'mine', good: 'ore', imported: 0, exported: 10, lost_transport: 0 },
  { city: 'forge', good: 'ore', imported: 10, exported: 0, lost_transport: 2 },
];
const flows = () => [
  { source: 'mine', destination: 'forge', good: 'ore', qty: 10, delivered: 8 },
];

describe('canonical physical trade journal guard', () => {
  it('accepts gross import postings with destination transport loss', () => {
    expect(() => assertPhysicalTradeJournal(balances(), flows())).not.toThrow();
  });

  it('rejects missing city postings even when global import/export totals balance', () => {
    const rows = balances();
    rows[0].exported = 9;
    rows[1].imported = 9;
    expect(() => assertPhysicalTradeJournal(rows, flows())).toThrow(/journal mismatch/);
  });

  it('rejects a transport loss omitted from the destination ledger', () => {
    const rows = balances();
    rows[1].lost_transport = 0;
    expect(() => assertPhysicalTradeJournal(rows, flows())).toThrow(/journal mismatch/);
  });

  it('rejects impossible transport gains, negative quantities and NaN', () => {
    for (const delivered of [11, -1, Number.NaN]) {
      const bad = flows();
      bad[0].delivered = delivered;
      expect(() => assertPhysicalTradeJournal(balances(), bad)).toThrow(/Invalid physical trade flow/);
    }
  });

  it('rejects orphan flows and duplicate balance rows', () => {
    expect(() => assertPhysicalTradeJournal(balances().slice(0, 1), flows())).toThrow(/no balance/);
    expect(() => assertPhysicalTradeJournal([...balances(), balances()[0]], flows())).toThrow(/Duplicate/);
  });
});
