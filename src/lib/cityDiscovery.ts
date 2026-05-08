import { supabase } from "@/integrations/supabase/client";

export const AXIAL_NEIGHBORS = [
  { dq: 1, dr: 0 }, { dq: -1, dr: 0 },
  { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
  { dq: 1, dr: -1 }, { dq: -1, dr: 1 },
];

const hKey = (q: number, r: number) => `${q},${r}`;

/** Returns true if the city's hex is adjacent to any player-owned/visible hex. */
export function canAutoDiscover(
  cityQ: number,
  cityR: number,
  knownCoords: Set<string>,
): boolean {
  if (knownCoords.has(hKey(cityQ, cityR))) return true;
  for (const { dq, dr } of AXIAL_NEIGHBORS) {
    if (knownCoords.has(hKey(cityQ + dq, cityR + dr))) return true;
  }
  return false;
}

/** Idempotent insert into discoveries. */
export async function discoverEntity(
  sessionId: string,
  playerName: string,
  entityType: string,
  entityId: string,
  source = "auto_proximity",
): Promise<void> {
  await supabase.from("discoveries").upsert(
    {
      session_id: sessionId,
      player_name: playerName,
      entity_type: entityType,
      entity_id: entityId,
      source,
    },
    { onConflict: "session_id,player_name,entity_type,entity_id" },
  );
}
