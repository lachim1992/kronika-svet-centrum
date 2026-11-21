import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type FinancialAccount = Tables<'financial_accounts'>;
export const SECTOR_ROWS = [
  { sector: 'MUNICIPAL', kind: 'CITY', label: 'Městské pokladny' },
  { sector: 'PRIVATE', kind: 'HOUSEHOLD', label: 'Soukromé · domácnosti' },
  { sector: 'PRIVATE', kind: 'BUSINESS', label: 'Soukromé · podniky' },
  { sector: 'ORGANIZATION', kind: 'ORGANIZATION', org: 'guild', label: 'Organizace · gildy' },
  { sector: 'ORGANIZATION', kind: 'ORGANIZATION', org: 'party', label: 'Organizace · strany' },
  { sector: 'ORGANIZATION', kind: 'ORGANIZATION', org: 'religious', label: 'Organizace · náboženské' },
] as const;

export const ORGANIZATION_KIND_LABEL: Record<string, string> = { guild: 'Gilda', party: 'Strana', religious: 'Náboženská' };
export function accountKindLabel(a: FinancialAccount) {
  if (a.sector === 'ORGANIZATION') return ORGANIZATION_KIND_LABEL[a.organization_kind ?? ''] ?? 'Organizace';
  return ({ CITY: 'Město', HOUSEHOLD: 'Domácnost', BUSINESS: 'Podnik' } as Record<string, string>)[a.owner_kind] ?? a.owner_kind;
}

/** Missing accounts are not zero wealth; only balances of explicitly stored accounts are summed. */
export function sectorBalance(accounts: FinancialAccount[], sector: string, kind: string, org?: string) {
  const rows = accounts.filter(a => a.sector === sector && a.owner_kind === kind && (org === undefined || a.organization_kind === org));
  return { count: rows.length, balance: rows.length ? rows.reduce((sum, a) => sum + Number(a.balance), 0) : null };
}

/** Current, owner-scoped reads only. Independent failures never become invented zero balances. */
export async function fetchFinancialSectors(sessionId: string, userId: string) {
  const seat = await supabase.from('game_players').select('player_name').eq('session_id', sessionId).eq('user_id', userId).maybeSingle();
  if (seat.error) throw seat.error;
  if (!seat.data) throw new Error('V této hře není dostupné vaše hráčské sedadlo.');
  const [accounts, state, capital, stateTransfers, session, turnFlows, purchases] = await Promise.all([
    supabase.from('financial_accounts').select('*').eq('session_id', sessionId).eq('controller_user_id', userId).order('created_at').order('id'),
    supabase.from('realm_resources').select('gold_reserve,total_wealth,computed_modifiers').eq('session_id', sessionId).eq('player_name', seat.data.player_name).maybeSingle(),
    supabase.rpc('read_financial_capital', { p_session: sessionId }),
    // Actually executed STATE<->municipal transfers only (no modelled income).
    supabase.from('financial_state_transfers').select('account_id,direction,amount').eq('session_id', sessionId),
    supabase.from('game_sessions').select('private_cash_version').eq('id', sessionId).maybeSingle(),
    supabase.from('financial_turn_flows').select('*').eq('session_id', sessionId).order('turn_number', { ascending: false }).limit(60),
    supabase.from('financial_purchase_flows').select('*').eq('session_id', sessionId).order('turn_number', { ascending: false }).limit(120),
  ]);
  return { accounts, state, capital, stateTransfers, session, turnFlows, purchases };
}
/** Ledger STATE grants (municipal funding or explicit pilot PRIVATE liquidity) vs remittances for one account (funded minus remitted), from the ledger. */
export function municipalStateFlows(rows: { account_id: string; direction: string; amount: number }[], accountId: string) {
  let funded = 0, remitted = 0;
  for (const r of rows) if (r.account_id === accountId) {
    if (r.direction === 'STATE_TO_MUNICIPAL' || r.direction === 'STATE_TO_PRIVATE') funded += Number(r.amount); else if (r.direction === 'MUNICIPAL_TO_STATE') remitted += Number(r.amount);
  }
  return { funded, remitted };
}
