import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type FinancialAccount = Tables<'financial_accounts'>;
export const SECTOR_ROWS = [
  { sector: 'MUNICIPAL', kind: 'CITY', label: 'Městské pokladny' },
  { sector: 'PRIVATE', kind: 'HOUSEHOLD', label: 'Soukromé · domácnosti' },
  { sector: 'PRIVATE', kind: 'BUSINESS', label: 'Soukromé · podniky' },
  { sector: 'ORGANIZATION', kind: 'ORGANIZATION', label: 'Organizace' },
] as const;

/** Missing accounts are not zero wealth; only balances of explicitly stored accounts are summed. */
export function sectorBalance(accounts: FinancialAccount[], sector: string, kind: string) {
  const rows = accounts.filter(a => a.sector === sector && a.owner_kind === kind);
  return { count: rows.length, balance: rows.length ? rows.reduce((sum, a) => sum + Number(a.balance), 0) : null };
}

/** Current, owner-scoped reads only. Independent failures never become invented zero balances. */
export async function fetchFinancialSectors(sessionId: string, userId: string) {
  const seat = await supabase.from('game_players').select('player_name').eq('session_id', sessionId).eq('user_id', userId).maybeSingle();
  if (seat.error) throw seat.error;
  if (!seat.data) throw new Error('V této hře není dostupné vaše hráčské sedadlo.');
  const [accounts, state, capital] = await Promise.all([
    supabase.from('financial_accounts').select('*').eq('session_id', sessionId).eq('controller_user_id', userId).order('created_at').order('id'),
    supabase.from('realm_resources').select('gold_reserve,total_wealth').eq('session_id', sessionId).eq('player_name', seat.data.player_name).maybeSingle(),
    supabase.rpc('read_financial_capital', { p_session: sessionId }),
  ]);
  return { accounts, state, capital };
}