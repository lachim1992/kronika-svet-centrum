/**
 * Smoke testy pro premise pipeline.
 * Pokrývají buildPremisePrompt (P0 vs P0+P0b) a loadCivContext fallback.
 */

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPremisePrompt, loadCivContext, type CivContext, type WorldPremise } from "./ai-context.ts";

function makePremise(overrides: Partial<WorldPremise> = {}): WorldPremise {
  return {
    id: "premise-1",
    sessionId: "sess-1",
    seed: "seed",
    epochStyle: "kroniky",
    cosmology: "",
    narrativeRules: {},
    economicBias: "balanced",
    warBias: "neutral",
    loreBible: "",
    worldVibe: "",
    writingStyle: "narrative",
    constraints: "",
    version: 3,
    chronicle0: "",
    geographyBlueprint: null,
    presentPremise: "Říše Krve a Železa po Zlomu.",
    preWorldPremise: "Před Zlomem zde žili Mlhoví Tkalci.",
    ancientLineages: [
      { name: "Mlhoví Tkalci", description: "Mistři tkanin z mlhy.", culturalAnchor: "tkalcovství" },
      { name: "Železní Synové", description: "Kovotepci pod horou." },
    ],
    ancientResetEvent: { type: "Pád Hvězdy", description: "Hvězda spadla a roztříštila kontinent." },
    ...overrides,
  };
}

function makeCivContext(overrides: Partial<CivContext> = {}): CivContext {
  return {
    playerName: "Aurelian",
    civName: "Aurelská Liga",
    civDescription: "Mořeplavecká federace měst opírající se o cechy navigátorů.",
    culturalQuirk: "rituál soumračné modlitby",
    architecturalStyle: "bílý kámen a azurové kupole",
    claimedLineages: [
      { name: "Mlhoví Tkalci", description: "Mistři tkanin z mlhy.", culturalAnchor: "tkalcovství" },
    ],
    lineagesSource: "per_player_heritage",
    ...overrides,
  };
}

Deno.test("buildPremisePrompt: bez civContext NEobsahuje P0b", () => {
  const out = buildPremisePrompt(makePremise());
  assertStringIncludes(out, "[P0 — DUÁLNÍ PREMISA SVĚTA");
  assertStringIncludes(out, "PREMISA SOUČASNOSTI");
  assertStringIncludes(out, "PREMISA PRADÁVNA");
  assert(!out.includes("[P0b"), "P0b nesmí být přítomen bez civContext");
});

Deno.test("buildPremisePrompt: s civContext obsahuje P0b a doslova civDescription", () => {
  const civ = makeCivContext();
  const out = buildPremisePrompt(makePremise(), civ);
  assertStringIncludes(out, "[P0b — PREMISA NÁRODA HRÁČE");
  assertStringIncludes(out, civ.civDescription!);
  assertStringIncludes(out, civ.civName!);
  assertStringIncludes(out, "ADOPTOVANÉ PRADÁVNÉ RODY");
});

Deno.test("buildPremisePrompt: world_fallback dostane jiný label než per_player", () => {
  const civ = makeCivContext({ lineagesSource: "world_fallback" });
  const out = buildPremisePrompt(makePremise(), civ);
  assertStringIncludes(out, "DĚDICTVÍ PRADÁVNA SDÍLENÉ SE SVĚTEM");
});

Deno.test("buildPremisePrompt: P0 vždy předchází P0b v textu", () => {
  const out = buildPremisePrompt(makePremise(), makeCivContext());
  const p0 = out.indexOf("[P0 — DUÁLNÍ PREMISA");
  const p0b = out.indexOf("[P0b — PREMISA NÁRODA");
  assert(p0 >= 0 && p0b > p0, "P0 musí být před P0b (priority order)");
});

// ── loadCivContext: stub Supabase client ──

function stubClient(opts: {
  civ?: any;
  identity?: any;
  heritage?: any[];
}) {
  return {
    from(table: string) {
      const builder: any = {
        _table: table,
        select() { return this; },
        eq() { return this; },
        limit() {
          if (table === "realm_heritage") return Promise.resolve({ data: opts.heritage ?? [], error: null });
          return this;
        },
        maybeSingle() {
          if (table === "civilizations") return Promise.resolve({ data: opts.civ ?? null, error: null });
          if (table === "civ_identity") return Promise.resolve({ data: opts.identity ?? null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  } as any;
}

Deno.test("loadCivContext: per-player heritage → lineagesSource = per_player_heritage", async () => {
  const client = stubClient({
    civ: { civ_name: "Test", core_myth: "Mýtus", cultural_quirk: null, architectural_style: null },
    heritage: [
      { lineage_name: "Mlhoví Tkalci", description: "x", cultural_anchor: "tkanina", player_name: "P1" },
    ],
  });
  const ctx = await loadCivContext("sess", "P1", makePremise(), client);
  assertEquals(ctx.lineagesSource, "per_player_heritage");
  assertEquals(ctx.claimedLineages.length, 1);
  assertEquals(ctx.civDescription, "Mýtus");
});

Deno.test("loadCivContext: prázdné per-player heritage → fallback na world lineages", async () => {
  const client = stubClient({
    civ: { civ_name: "Test", core_myth: null, cultural_quirk: null, architectural_style: null },
    heritage: [],
  });
  const ctx = await loadCivContext("sess", "P1", makePremise(), client);
  assertEquals(ctx.lineagesSource, "world_fallback");
  assert(ctx.claimedLineages.length > 0, "fallback musí dodat aspoň 1 rod ze světa");
});

Deno.test("loadCivContext: bez world lineages a bez heritage → lineagesSource = none", async () => {
  const client = stubClient({ civ: null, heritage: [] });
  const premise = makePremise({ ancientLineages: [] });
  const ctx = await loadCivContext("sess", "P1", premise, client);
  assertEquals(ctx.lineagesSource, "none");
  assertEquals(ctx.claimedLineages.length, 0);
});
