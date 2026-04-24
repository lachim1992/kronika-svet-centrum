// ─────────────────────────────────────────────────────────────────────────────
// create-world-bootstrap — Unified World Bootstrap v1
//
// Single canonical entrypoint for world creation across all game modes.
// Replaces the ad-hoc multi-call flow (wizard → world_foundations → server_config
// → generate-world-map → world-generate-init) with one orchestrated request.
//
// Hard safeguards (per v1 lock):
//   1. Idempotency — second call on a 'ready' session returns alreadyBootstrapped
//   2. Status transitions — every run leaves bootstrap_status in {ready, failed}
//   3. Seed determinism — same seed + same payload → same worldgen_spec
//   4. Parity — world_foundations.map_{width,height} == worldgen_spec.resolvedSize
//
// NOT in scope (Increment 1):
//   • Prompt → bias translator (Increment 2)
//   • Removal of world-generate-init (Increment 3)
//   • UI cleanup in WorldSetupWizard (Increment 3)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { resolveMapSize, type WorldSize } from "../_shared/world-sizes.ts";
import type {
  BootstrapStepRecord,
  CreateWorldBootstrapRequest,
  CreateWorldBootstrapResponse,
  GameMode,
  LegacyWorldgenSpecFields,
  WorldgenSpecV1,
} from "../_shared/world-bootstrap-types.ts";

type LegacySpec = WorldgenSpecV1 & LegacyWorldgenSpecFields;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Validation ───────────────────────────────────────────────────────────────

function validateRequest(body: unknown): CreateWorldBootstrapRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Body must be an object");
  }
  const b = body as Record<string, unknown>;

  if (typeof b.sessionId !== "string" || !b.sessionId) {
    throw new Error("sessionId required");
  }
  if (typeof b.playerName !== "string" || !b.playerName) {
    throw new Error("playerName required");
  }

  const allowedModes: GameMode[] = [
    "tb_single_ai",
    "tb_single_manual",
    "tb_multi",
    "time_persistent",
  ];
  if (!allowedModes.includes(b.mode as GameMode)) {
    throw new Error(`mode must be one of ${allowedModes.join(", ")}`);
  }

  const world = b.world as Record<string, unknown> | undefined;
  if (!world) throw new Error("world required");
  if (typeof world.name !== "string" || !world.name) {
    throw new Error("world.name required");
  }
  if (typeof world.premise !== "string") {
    throw new Error("world.premise required");
  }
  if (typeof world.tone !== "string") throw new Error("world.tone required");
  if (typeof world.victoryStyle !== "string") {
    throw new Error("world.victoryStyle required");
  }
  if (!["small", "medium", "large"].includes(world.size as string)) {
    throw new Error("world.size must be small | medium | large");
  }

  return body as CreateWorldBootstrapRequest;
}

// ── Normalization ────────────────────────────────────────────────────────────

interface NormalizedRequest extends CreateWorldBootstrapRequest {
  resolvedSeed: string;
  resolvedTerrain: Required<{
    targetLandRatio: number;
    continentShape: string;
    continentCount: number;
    mountainDensity: number;
    biomeWeights: Record<string, number>;
  }>;
}

function normalizeBootstrapRequest(
  req: CreateWorldBootstrapRequest,
): NormalizedRequest {
  const seed = req.world.seed?.trim() || crypto.randomUUID();
  const t = req.map?.terrain ?? {};
  return {
    ...req,
    resolvedSeed: seed,
    resolvedTerrain: {
      targetLandRatio: typeof t.targetLandRatio === "number"
        ? t.targetLandRatio
        : 0.55,
      continentShape: t.continentShape ?? "mixed",
      continentCount: t.continentCount ?? 2,
      mountainDensity: typeof t.mountainDensity === "number"
        ? t.mountainDensity
        : 0.3,
      biomeWeights: t.biomeWeights ?? {},
    },
  };
}

function buildWorldgenSpecV1(req: NormalizedRequest): LegacySpec {
  const resolved = resolveMapSize(req.world.size, req.map?.advancedOverride);
  return {
    version: 1,
    seed: req.resolvedSeed,
    factionCount: 0,
    mode: req.mode,
    userIntent: {
      worldName: req.world.name,
      premise: req.world.premise,
      tone: req.world.tone,
      victoryStyle: req.world.victoryStyle,
      style: "default",
      size: req.world.size,
    },
    resolvedSize: resolved,
    terrain: req.resolvedTerrain,
    geographyBlueprint: {
      ridges: [],
      biomeZones: [],
      climateGradient: "uniform",
      oceanPattern: "minimal",
    },
    notes: {
      usedAdvancedOverride: resolved.source === "advanced_override",
      promptBiasApplied: false,
    },
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = performance.now();
  const steps: BootstrapStepRecord[] = [];
  const warnings: string[] = [];

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let normalized: NormalizedRequest | null = null;

  try {
    // ── Step 0a: validate ─────────────────────────────────────────────────
    const t0 = performance.now();
    const raw = await req.json();
    const validated = validateRequest(raw);
    normalized = normalizeBootstrapRequest(validated);
    steps.push({
      step: "validate-normalize",
      ok: true,
      durationMs: performance.now() - t0,
    });

    // ── Step 0b: idempotency guard ────────────────────────────────────────
    const tIdem = performance.now();
    const { data: existing } = await sb
      .from("world_foundations")
      .select("id, bootstrap_status, worldgen_spec, map_width, map_height")
      .eq("session_id", normalized.sessionId)
      .maybeSingle();

    if (existing?.bootstrap_status === "ready") {
      const spec = existing.worldgen_spec as LegacySpec | null;
      if (normalized.mode !== "tb_multi") {
        await sb
          .from("game_sessions")
          .update(
            { init_status: "ready", current_turn: 1, init_step: "done" } as any,
          )
          .eq("id", normalized.sessionId);
      }
      return jsonResponse({
        ok: true,
        sessionId: normalized.sessionId,
        worldReady: true,
        alreadyBootstrapped: true,
        worldgen: spec && spec.resolvedSize
          ? {
            seed: spec.seed,
            size: spec.userIntent.size,
            mapWidth: spec.resolvedSize.width,
            mapHeight: spec.resolvedSize.height,
            mode: spec.mode!,
          }
          : undefined,
        steps: [
          ...steps,
          {
            step: "idempotency-check",
            ok: true,
            durationMs: performance.now() - tIdem,
            detail: "already ready",
          },
        ],
      });
    }
    if (existing?.bootstrap_status === "bootstrapping") {
      return jsonResponse(
        {
          ok: false,
          sessionId: normalized.sessionId,
          worldReady: false,
          error: "Bootstrap already in progress for this session",
          steps,
        },
        409,
      );
    }
    steps.push({
      step: "idempotency-check",
      ok: true,
      durationMs: performance.now() - tIdem,
      detail: existing
        ? `prior status=${existing.bootstrap_status}`
        : "no prior",
    });

    // ── Build spec early (needed for all downstream steps) ────────────────
    const spec = buildWorldgenSpecV1(normalized);

    // ── Step 1: world_foundations upsert + status='bootstrapping' ─────────
    const t1 = performance.now();
    const wfPayload = {
      session_id: normalized.sessionId,
      world_name: normalized.world.name,
      premise: normalized.world.premise,
      tone: normalized.world.tone,
      victory_style: normalized.world.victoryStyle,
      map_width: spec.resolvedSize!.width,
      map_height: spec.resolvedSize!.height,
      worldgen_spec: spec,
      worldgen_version: 1,
      bootstrap_status: "bootstrapping" as const,
      bootstrap_error: null,
    };
    const { data: wf, error: wfErr } = await sb
      .from("world_foundations")
      .upsert(wfPayload, { onConflict: "session_id" })
      .select("id")
      .single();
    if (wfErr) {
      throw new Error(`world_foundations upsert failed: ${wfErr.message}`);
    }
    steps.push({
      step: "world-foundations",
      ok: true,
      durationMs: performance.now() - t1,
      detail: `id=${wf.id}`,
    });

    // ── Step 2: server_config ensure ──────────────────────────────────────
    const t2 = performance.now();
    const serverConfig = await ensureServerConfig(sb, normalized);
    steps.push({
      step: "server-config",
      ok: true,
      durationMs: performance.now() - t2,
      detail: `id=${serverConfig.id}`,
    });

    // ── Step 3: persist worldgen_spec confirmation ────────────────────────
    // (already persisted in step 1; this step is a no-op marker for audit)
    steps.push({
      step: "persist-worldgen-spec",
      ok: true,
      durationMs: 0,
      detail: "persisted in world-foundations step",
    });

    // ── Step 4: canonical map generation ──────────────────────────────────
    const t4 = performance.now();
    const mapResp = await invokeGenerateWorldMap(normalized.sessionId, spec);
    steps.push({
      step: "generate-world-map",
      ok: true,
      durationMs: performance.now() - t4,
      detail: `hexCount=${mapResp.hexCount ?? 0} startPositions=${
        mapResp.startPositions?.length ?? 0
      }`,
    });

    // ── Step 5: parity check ──────────────────────────────────────────────
    if (
      typeof mapResp.mapWidth === "number" &&
      typeof mapResp.mapHeight === "number" &&
      (mapResp.mapWidth !== spec.resolvedSize!.width ||
        mapResp.mapHeight !== spec.resolvedSize!.height)
    ) {
      throw new Error(
        `Size parity violation: spec=${spec.resolvedSize!.width}x${
          spec.resolvedSize!.height
        }, map=${mapResp.mapWidth}x${mapResp.mapHeight}`,
      );
    }
    steps.push({ step: "parity-check", ok: true, durationMs: 0 });

    // ── Step 6: placement artifacts (v1 stub — uses map startPositions) ───
    // Province centers / region skeleton derivation lives downstream in
    // mode-specific seeding. v1 just records what the map produced.
    const startPositionsCount = mapResp.startPositions?.length ?? 0;
    steps.push({
      step: "placement-artifacts",
      ok: true,
      durationMs: 0,
      detail: `start_positions=${startPositionsCount}`,
    });

    // ── Step 7: mode-specific seeding ─────────────────────────────────────
    // Important: do not synchronously await AI-heavy seeding here.
    // `world-generate-init` can take well over 100s, which pushes the whole
    // orchestrator beyond the 150s edge timeout. We only dispatch it and return.
    const t7 = performance.now();
    const seeding = await runModeSpecificSeeding(sb, normalized, spec);
    steps.push({
      step: "mode-specific-seeding",
      ok: seeding.ok,
      durationMs: performance.now() - t7,
      detail: seeding.detail,
    });
    if (!seeding.ok && seeding.warning) warnings.push(seeding.warning);

    // ── Step 7b: world-layer projection (v9.1 ancient_layer → live world) ──
    // Fire-and-forget: this projection is non-fatal and can run ~5-10s on its
    // own. We do NOT await it to keep the orchestrator under the 150s budget.
    const t7b = performance.now();
    try {
      const wlUrl = `${SUPABASE_URL}/functions/v1/world-layer-bootstrap`;
      // Detached invocation — intentionally not awaited.
      fetch(wlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sessionId: normalized.sessionId }),
      }).then((r) => r.text()).catch((e) => {
        console.warn("world-layer-bootstrap (detached) error:", e);
      });
      steps.push({
        step: "world-layer-projection",
        ok: true,
        durationMs: performance.now() - t7b,
        detail: "dispatched (fire-and-forget)",
      });
    } catch (e) {
      warnings.push(
        `world-layer-bootstrap dispatch threw: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    // ── Step 8: finalize ──────────────────────────────────────────────────
    const t8 = performance.now();
    if (normalized.mode !== "tb_multi") {
      await sb
        .from("game_sessions")
        .update(
          { init_status: "ready", current_turn: 1, init_step: "done" } as any,
        )
        .eq("id", normalized.sessionId);
    }
    await sb
      .from("world_foundations")
      .update({ bootstrap_status: "ready", bootstrap_error: null })
      .eq("session_id", normalized.sessionId);
    steps.push({
      step: "finalize-world-ready",
      ok: true,
      durationMs: performance.now() - t8,
    });

    const response: CreateWorldBootstrapResponse = {
      ok: true,
      sessionId: normalized.sessionId,
      worldReady: true,
      worldgen: {
        seed: spec.seed,
        size: normalized.world.size,
        mapWidth: spec.resolvedSize!.width,
        mapHeight: spec.resolvedSize!.height,
        mode: normalized.mode,
      },
      artifacts: {
        worldFoundationsId: wf.id,
        serverConfigId: serverConfig.id,
        mapGenerated: true,
        startPositionsCount,
        provincesSeeded: seeding.provincesSeeded,
        factionsSeeded: seeding.factionsSeeded,
      },
      steps,
      warnings: warnings.length ? warnings : undefined,
    };

    return jsonResponse(response);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("create-world-bootstrap error:", errorMsg);

    // Mark failure in DB if we have a session
    if (normalized?.sessionId) {
      try {
        await sb
          .from("world_foundations")
          .update({
            bootstrap_status: "failed",
            bootstrap_error: errorMsg.slice(0, 2000),
          })
          .eq("session_id", normalized.sessionId);
      } catch (markErr) {
        console.error("Failed to mark bootstrap_status=failed:", markErr);
      }
    }

    return jsonResponse(
      {
        ok: false,
        sessionId: normalized?.sessionId ?? "",
        worldReady: false,
        error: errorMsg,
        steps,
      },
      500,
    );
  } finally {
    console.log(
      `create-world-bootstrap total ${
        (performance.now() - startedAt).toFixed(0)
      }ms`,
    );
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(
  body: CreateWorldBootstrapResponse,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ensureServerConfig(
  sb: any,
  req: NormalizedRequest,
): Promise<{ id: string }> {
  const { data: existing } = await sb
    .from("server_config")
    .select("id, economic_params")
    .eq("session_id", req.sessionId)
    .maybeSingle();

  const defaultEconomic = {
    world_gen_mode: "cheap_start",
    auto_generate_city_profiles: false,
    auto_generate_top_city_profiles: true,
    top_profiles_count: 3,
    lazy_generate_on_open: true,
    dev_unlock_premium: true,
  };

  if (existing) {
    const stored = (existing.economic_params as Record<string, unknown>) || {};
    const merged = { ...defaultEconomic, ...stored };
    await sb
      .from("server_config")
      .update({ economic_params: merged })
      .eq("id", existing.id as string);
    return { id: existing.id as string };
  }

  const insertPayload: Record<string, unknown> = {
    session_id: req.sessionId,
    economic_params: defaultEconomic,
  };
  if (req.server?.tickIntervalSeconds) {
    insertPayload.tick_interval_seconds = req.server.tickIntervalSeconds;
  }
  if (req.server?.timeScale) insertPayload.time_scale = req.server.timeScale;
  if (req.server?.maxPlayers) insertPayload.max_players = req.server.maxPlayers;

  const { data: created, error } = await sb
    .from("server_config")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) throw new Error(`server_config insert failed: ${error.message}`);
  return { id: created.id as string };
}

interface MapGenResp {
  hexCount?: number;
  mapWidth?: number;
  mapHeight?: number;
  startPositions?: Array<{ q: number; r: number }>;
}

async function invokeGenerateWorldMap(
  sessionId: string,
  spec: LegacySpec,
): Promise<MapGenResp> {
  // Direct internal call to generate-world-map.
  const url = `${SUPABASE_URL}/functions/v1/generate-world-map`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      session_id: sessionId,
      width: spec.resolvedSize!.width,
      height: spec.resolvedSize!.height,
      terrain_params: spec.terrain,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `generate-world-map failed (${resp.status}): ${text.slice(0, 500)}`,
    );
  }
  return (await resp.json()) as MapGenResp;
}

interface SeedingResult {
  ok: boolean;
  provincesSeeded?: number;
  factionsSeeded?: number;
  detail?: string;
  warning?: string;
}

async function runModeSpecificSeeding(
  _sb: any,
  req: NormalizedRequest,
  _spec: LegacySpec,
): Promise<SeedingResult> {
  switch (req.mode) {
    case "tb_single_ai": {
      // Delegate AI-specific seeding to existing world-generate-init,
      // but DO NOT await it here. This function must stay safely below the
      // edge timeout budget, so AI generation is detached.
      try {
        const url = `${SUPABASE_URL}/functions/v1/world-generate-init`;
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            sessionId: req.sessionId,
            playerName: req.playerName,
            worldName: req.world.name,
            premise: req.world.premise,
            tone: req.world.tone,
            victoryStyle: req.world.victoryStyle,
            worldSize: req.world.size,
            settlementName: req.identity?.settlementName,
            cultureName: req.identity?.cultureName,
            languageName: req.identity?.languageName,
            realmName: req.identity?.realmName,
            factionConfigs: req.factions,
            terrainParams: req.resolvedTerrain,
            mapWidth: undefined,
            mapHeight: undefined,
          }),
        })
          .then(async (resp) => {
            if (!resp.ok) {
              const text = await resp.text();
              console.warn(
                `world-generate-init detached failure (${resp.status}): ${
                  text.slice(0, 300)
                }`,
              );
              return;
            }
            await resp.text();
          })
          .catch((e) => {
            console.warn("world-generate-init detached error:", e);
          });

        return {
          ok: true,
          detail: "dispatched to world-generate-init (background)",
          warning: "AI seed běží na pozadí; svět se doplní postupně.",
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          ok: false,
          warning: `AI seeding dispatch threw: ${msg}`,
          detail: "ai-seed-dispatch-error",
        };
      }
    }

    case "tb_single_manual":
      // Minimal seed: map + foundations are sufficient for manual storytelling.
      return { ok: true, detail: "manual mode — minimal seed" };

    case "tb_multi":
      // Parity-safe player slots are managed elsewhere (mp-world-generate path).
      // v1: no-op; Increment 3 may inline parity setup here.
      return { ok: true, detail: "multi mode — parity setup deferred" };

    case "time_persistent":
      // Tick-tuned setup is handled by existing persistent infrastructure.
      return { ok: true, detail: "persistent mode — tick setup deferred" };
  }
}
