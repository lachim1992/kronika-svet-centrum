/**
 * wiki-orchestrator — JEDINÁ gateway pro veškerou wiki generaci.
 *
 * Centralizuje generování textu i obrázků podle per-entity policy a respektuje locky.
 * Žádná feature funkce nesmí volat AI/image generator přímo — vše musí jít přes tuto funkci.
 *
 * Akce:
 *  - ensure     { session_id, entity_type, entity_id, entity_name, owner_player?, defaults? }
 *      → vrátí beze změn pokud má vše dle policy. Jinak vygeneruje jen chybějící pole.
 *      → respektuje content_locked / image_locked.
 *  - regenerate { entry_id, fields? }
 *      → explicitně přegeneruje (ignoruje locky a policy). fields = ['content'] | ['image'] | ['content','image']
 *  - lock       { entry_id, content?, image? } / unlock { entry_id, content?, image? }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─────────────────────────────────────────────────────────────────────────────
// Generation policy per entity_type
// ─────────────────────────────────────────────────────────────────────────────

type Policy = { text: boolean; image: boolean };

const GENERATION_POLICY: Record<string, Policy> = {
  // Text + image:
  world:        { text: true, image: true },
  country:      { text: true, image: true },
  land:         { text: true, image: true },
  province:     { text: true, image: true },
  region:       { text: true, image: true },
  city:         { text: true, image: true },
  free_city:    { text: true, image: true },
  wonder:       { text: true, image: true },
  building:     { text: true, image: true },
  neutral_node: { text: true, image: true },
  annexed_node: { text: true, image: true },
  person:       { text: true, image: true },
  academy:      { text: true, image: true },
  // Text-only (image only on explicit regenerate):
  law:          { text: true, image: false },
  chronicle:    { text: true, image: false },
  treaty:       { text: true, image: false },
  declaration:  { text: true, image: false },
};

const DEFAULT_POLICY: Policy = { text: true, image: true };
const policyFor = (entityType: string): Policy => GENERATION_POLICY[entityType] ?? DEFAULT_POLICY;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface WikiEntryRow {
  id: string;
  session_id: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string;
  owner_player: string | null;
  summary: string | null;
  ai_description: string | null;
  body_md: string | null;
  image_url: string | null;
  image_prompt: string | null;
  content_locked: boolean;
  image_locked: boolean;
  generation_status: string;
  image_generation_status: string;
  generation_version: number;
  last_generated_at: string | null;
}

async function fetchEntry(params: {
  session_id: string;
  entity_type: string;
  entity_id?: string | null;
  entity_name?: string;
}): Promise<WikiEntryRow | null> {
  let q = sb
    .from("wiki_entries")
    .select(
      "id, session_id, entity_type, entity_id, entity_name, owner_player, summary, ai_description, body_md, image_url, image_prompt, content_locked, image_locked, generation_status, image_generation_status, generation_version, last_generated_at",
    )
    .eq("session_id", params.session_id)
    .eq("entity_type", params.entity_type)
    .limit(1);

  if (params.entity_id) q = q.eq("entity_id", params.entity_id);
  else if (params.entity_name) q = q.eq("entity_name", params.entity_name);

  const { data } = await q.maybeSingle();
  return (data as WikiEntryRow | null) ?? null;
}

async function ensurePlaceholder(params: {
  session_id: string;
  entity_type: string;
  entity_id?: string | null;
  entity_name: string;
  owner_player?: string | null;
  defaults?: Record<string, unknown>;
}): Promise<WikiEntryRow> {
  const existing = await fetchEntry(params);
  if (existing) return existing;

  const insertPayload: Record<string, unknown> = {
    session_id: params.session_id,
    entity_type: params.entity_type,
    entity_id: params.entity_id ?? null,
    entity_name: params.entity_name,
    owner_player: params.owner_player ?? "",
    generation_status: "pending",
    image_generation_status: "pending",
    ...(params.defaults ?? {}),
  };

  const { data, error } = await sb
    .from("wiki_entries")
    .insert(insertPayload)
    .select(
      "id, session_id, entity_type, entity_id, entity_name, owner_player, summary, ai_description, body_md, image_url, image_prompt, content_locked, image_locked, generation_status, image_generation_status, generation_version, last_generated_at",
    )
    .single();

  if (error) {
    // Race: another caller inserted the row first → fetch and return.
    const refetch = await fetchEntry(params);
    if (refetch) return refetch;
    throw error;
  }
  return data as WikiEntryRow;
}

function hasText(row: WikiEntryRow): boolean {
  return Boolean((row.summary && row.summary.trim().length > 0) || (row.ai_description && row.ai_description.trim().length > 10));
}

function hasImage(row: WikiEntryRow): boolean {
  return Boolean(row.image_url && row.image_url.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal generators (delegate to existing pipelines)
// ─────────────────────────────────────────────────────────────────────────────

async function _generateText(row: WikiEntryRow): Promise<{ ok: boolean; error?: string }> {
  // Delegate to existing wiki-generate (entity-specific builders, premise injection).
  // wiki-generate itself upserts summary/ai_description/image_prompt into wiki_entries.
  // NOTE: wiki-generate also triggers image generation downstream — that is intentional
  // for entities whose policy includes image. For text-only policy entities we suppress
  // image afterwards by NOT calling _generateImage (image_url stays null).
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/wiki-generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: row.session_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityName: row.entity_name,
        ownerPlayer: row.owner_player ?? "",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `wiki-generate ${res.status}: ${body.slice(0, 200)}` };
    }
    await res.text();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function _generateImage(row: WikiEntryRow): Promise<{ ok: boolean; imageUrl?: string; error?: string }> {
  if (!row.entity_id) return { ok: false, error: "missing entity_id for image generation" };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-entity-media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: row.session_id,
        entityId: row.entity_id,
        entityType: row.entity_type,
        entityName: row.entity_name,
        kind: "cover",
        imagePrompt: row.image_prompt ?? `${row.entity_name} — ${row.entity_type}`,
        createdBy: "wiki-orchestrator",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `generate-entity-media ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = await res.json();
    return { ok: true, imageUrl: data?.imageUrl ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

async function actionEnsure(payload: any) {
  const { session_id, entity_type, entity_id, entity_name, owner_player, defaults } = payload;
  if (!session_id || !entity_type || !entity_name) {
    return json({ error: "session_id, entity_type and entity_name are required" }, 400);
  }

  const row = await ensurePlaceholder({ session_id, entity_type, entity_id, entity_name, owner_player, defaults });
  const policy = policyFor(entity_type);

  const needText = policy.text && !row.content_locked && !hasText(row);
  const needImage = policy.image && !row.image_locked && !hasImage(row);

  if (!needText && !needImage) {
    return json({ ok: true, action: "skipped", entry_id: row.id, reason: "already satisfies policy" });
  }

  // Mark generating
  await sb
    .from("wiki_entries")
    .update({
      ...(needText ? { generation_status: "generating" } : {}),
      ...(needImage ? { image_generation_status: "generating" } : {}),
    })
    .eq("id", row.id);

  let textResult: { ok: boolean; error?: string } | null = null;
  let imageResult: { ok: boolean; imageUrl?: string; error?: string } | null = null;

  if (needText) {
    textResult = await _generateText(row);
  }

  // Re-fetch to pick up wiki-generate's updates (summary, image_prompt) before image step.
  const refreshed = needText ? (await fetchEntry({ session_id, entity_type, entity_id, entity_name })) ?? row : row;

  if (needImage) {
    imageResult = await _generateImage(refreshed);
  }

  // Final status update + lock-on-success.
  const updates: Record<string, unknown> = {
    last_generated_at: new Date().toISOString(),
  };
  if (needText) {
    updates.generation_status = textResult?.ok ? "ready" : "failed";
    if (textResult?.ok) updates.content_locked = true;
  }
  if (needImage) {
    updates.image_generation_status = imageResult?.ok ? "ready" : "failed";
    if (imageResult?.ok) {
      updates.image_locked = true;
      if (imageResult.imageUrl) updates.image_url = imageResult.imageUrl;
    }
  }

  await sb.from("wiki_entries").update(updates).eq("id", row.id);

  return json({
    ok: true,
    action: "generated",
    entry_id: row.id,
    text: textResult,
    image: imageResult,
    policy,
  });
}

async function actionRegenerate(payload: any) {
  const { entry_id, fields } = payload;
  if (!entry_id) return json({ error: "entry_id is required" }, 400);

  const { data, error } = await sb
    .from("wiki_entries")
    .select(
      "id, session_id, entity_type, entity_id, entity_name, owner_player, summary, ai_description, body_md, image_url, image_prompt, content_locked, image_locked, generation_status, image_generation_status, generation_version, last_generated_at",
    )
    .eq("id", entry_id)
    .maybeSingle();

  if (error || !data) return json({ error: "entry not found" }, 404);
  const row = data as WikiEntryRow;

  const wantedFields: string[] = Array.isArray(fields) && fields.length > 0 ? fields : ["content", "image"];
  const doText = wantedFields.includes("content");
  const doImage = wantedFields.includes("image");

  await sb
    .from("wiki_entries")
    .update({
      ...(doText ? { generation_status: "generating", content_locked: false } : {}),
      ...(doImage ? { image_generation_status: "generating", image_locked: false } : {}),
    })
    .eq("id", row.id);

  let textResult: { ok: boolean; error?: string } | null = null;
  let imageResult: { ok: boolean; imageUrl?: string; error?: string } | null = null;

  if (doText) {
    // Clear text fields so wiki-generate's "preserve existing" logic doesn't short-circuit.
    await sb.from("wiki_entries").update({ summary: null, ai_description: null }).eq("id", row.id);
    textResult = await _generateText(row);
  }

  const refreshed = (await fetchEntry({
    session_id: row.session_id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    entity_name: row.entity_name,
  })) ?? row;

  if (doImage) {
    imageResult = await _generateImage(refreshed);
  }

  const updates: Record<string, unknown> = {
    last_generated_at: new Date().toISOString(),
    generation_version: (row.generation_version ?? 1) + 1,
  };
  if (doText) {
    updates.generation_status = textResult?.ok ? "ready" : "failed";
    if (textResult?.ok) updates.content_locked = true;
  }
  if (doImage) {
    updates.image_generation_status = imageResult?.ok ? "ready" : "failed";
    if (imageResult?.ok) {
      updates.image_locked = true;
      if (imageResult.imageUrl) updates.image_url = imageResult.imageUrl;
    }
  }

  await sb.from("wiki_entries").update(updates).eq("id", row.id);

  return json({ ok: true, action: "regenerated", entry_id: row.id, text: textResult, image: imageResult });
}

async function actionLock(payload: any, lockState: boolean) {
  const { entry_id, content, image } = payload;
  if (!entry_id) return json({ error: "entry_id is required" }, 400);
  const updates: Record<string, unknown> = {};
  if (content === true) updates.content_locked = lockState;
  if (image === true) updates.image_locked = lockState;
  if (Object.keys(updates).length === 0) {
    return json({ error: "specify content:true and/or image:true" }, 400);
  }
  const { error } = await sb.from("wiki_entries").update(updates).eq("id", entry_id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, action: lockState ? "locked" : "unlocked", entry_id, updates });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP entrypoint
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const action = String(payload?.action ?? "").toLowerCase();

    switch (action) {
      case "ensure":
        return await actionEnsure(payload);
      case "regenerate":
        return await actionRegenerate(payload);
      case "lock":
        return await actionLock(payload, true);
      case "unlock":
        return await actionLock(payload, false);
      default:
        return json({ error: `unknown action '${action}'. Use: ensure | regenerate | lock | unlock` }, 400);
    }
  } catch (e) {
    console.error("wiki-orchestrator error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
