/**
 * Client wrapper around the `wiki-orchestrator` edge function.
 *
 * P3 — every wiki/image generation in the UI MUST go through here, never call
 * `wiki-generate` / `encyclopedia-image` / `encyclopedia-generate` /
 * `generate-entity-media` directly. The orchestrator enforces per-entity policy,
 * cache-first behaviour and locks.
 */

import { supabase } from "@/integrations/supabase/client";

export interface EnsureWikiArgs {
  sessionId: string;
  entityType: string;
  entityId?: string | null;
  entityName: string;
  ownerPlayer?: string | null;
  defaults?: Record<string, unknown>;
}

export interface EnsureWikiResult {
  ok: boolean;
  action?: "skipped" | "generated";
  entry_id?: string;
  text?: { ok: boolean; error?: string } | null;
  image?: { ok: boolean; imageUrl?: string; error?: string } | null;
  error?: string;
}

export async function ensureWikiEntry(args: EnsureWikiArgs): Promise<EnsureWikiResult> {
  const { data, error } = await supabase.functions.invoke("wiki-orchestrator", {
    body: {
      action: "ensure",
      session_id: args.sessionId,
      entity_type: args.entityType,
      entity_id: args.entityId ?? null,
      entity_name: args.entityName,
      owner_player: args.ownerPlayer ?? "",
      defaults: args.defaults,
    },
  });
  if (error) return { ok: false, error: error.message };
  return data as EnsureWikiResult;
}

export type RegenerateField = "content" | "image";

export async function regenerateWiki(
  entryId: string,
  fields: RegenerateField[] = ["content", "image"],
): Promise<EnsureWikiResult> {
  const { data, error } = await supabase.functions.invoke("wiki-orchestrator", {
    body: { action: "regenerate", entry_id: entryId, fields },
  });
  if (error) return { ok: false, error: error.message };
  return data as EnsureWikiResult;
}

/**
 * Convenience: ensure entry exists and return its id (used by callers that need
 * to immediately follow up with a regenerate or read).
 */
export async function ensureAndGetEntryId(args: EnsureWikiArgs): Promise<string | null> {
  const res = await ensureWikiEntry(args);
  if (res.ok && res.entry_id) return res.entry_id;
  // Fallback: look up directly
  if (!args.entityId) return null;
  const { data } = await supabase
    .from("wiki_entries")
    .select("id")
    .eq("session_id", args.sessionId)
    .eq("entity_type", args.entityType)
    .eq("entity_id", args.entityId)
    .maybeSingle();
  return (data as any)?.id ?? null;
}
