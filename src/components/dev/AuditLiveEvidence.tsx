import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function AuditLiveEvidence({ sessionId }: { sessionId: string }) {
  const { data, error, dataUpdatedAt } = useQuery({
    queryKey: ['mechanics-live-evidence', sessionId], staleTime: 30000,
    queryFn: async () => {
      const rows = await Promise.all([
        supabase.from('goods').select('id', { count: 'exact', head: true }),
        supabase.from('production_recipes').select('id', { count: 'exact', head: true }),
        supabase.from('city_market_baskets').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
        supabase.from('basket_trade_flows').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
        supabase.from('province_nodes').select('id', { count: 'exact', head: true }).eq('session_id', sessionId).eq('production_role', 'guild'),
        supabase.from('province_nodes').select('id', { count: 'exact', head: true }).eq('session_id', sessionId).gt('specialization_last_turn', 0),
      ]);
      for (const row of rows) if (row.error) throw row.error;
      return rows.map(row => row.count);
    },
  });
  return <div className="border-y border-border py-2 mb-2 text-[10px]">
    <p className="font-semibold">LIVE · {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'}</p>
    {error ? <p className="text-destructive">Nedostupné: {error.message}</p> : !data ? <p>Načítání…</p> :
      <div className="flex flex-wrap gap-x-4 gap-y-1">{['Katalog zboží', 'Katalog receptů', 'Koše této hry', 'Toky této hry', 'Cechovní uzly', 'Uzly s připsanou specializací'].map((label, i) => <span key={label}>{label}: {data[i] ?? 'neznámé'}</span>)}</div>}
    <p className="text-muted-foreground mt-1">Počet řádků není důkaz správné mechaniky; 0 není chybějící implementace.</p>
  </div>;
}