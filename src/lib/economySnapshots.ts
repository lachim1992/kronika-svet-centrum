import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type SnapshotTable = "city_market_baskets" | "market_shares";
const PAGE_SIZE = 500;

// These tables retain history. An empty current turn must stay empty, and a
// large world must not be mistaken for the first page of its snapshot.
export async function readEconomySnapshot<T extends SnapshotTable>(
  table: T, sessionId: string, currentTurn: number, playerName?: string,
): Promise<Tables<T>[]> {
  if (!Number.isInteger(currentTurn) || currentTurn < 0) throw new Error("Neplatné číslo tahu.");
  const rows: Tables<T>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from(table as SnapshotTable).select("*")
      .eq("session_id", sessionId).eq("turn_number", currentTurn)
      .order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (playerName !== undefined) query = query.eq("player_name", playerName);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Server nevrátil ekonomická data.");
    rows.push(...data as Tables<T>[]);
    if (data.length < PAGE_SIZE) return rows;
  }
}
