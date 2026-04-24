// Track 1 (T1-PR2) — Deterministic Ancient Layer fallback + helpers.
//
// Used by translate-premise-to-spec when the AI ancient_layer call fails,
// returns malformed data, or is rate-limited. Also used to compute the
// stable seed_hash and to provide default selected_lineages.
//
// K3 determinism: same (premise, nonce, ANCIENT_PROMPT_VERSION) MUST produce
// the same fallback layer. No randomness, no Date.now(), no network input.

import type {
  AncientLayerSpec,
  LineageProposal,
  MythicSeed,
  ResetEvent,
} from "./ancient-layer-types.ts";

/** Bump when the ancient-layer prompt or fallback grammar changes (K3). */
export const ANCIENT_PROMPT_VERSION = 1;

// ─── Deterministic seed_hash ────────────────────────────────────────────────

export async function computeSeedHash(
  normalizedPremise: string,
  nonce: number,
  promptVersion: number = ANCIENT_PROMPT_VERSION,
): Promise<string> {
  const input = `${normalizedPremise}|${nonce}|v${promptVersion}|ancient`;
  const buf = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Deterministic PRNG (mulberry32 over hash prefix) ───────────────────────

function seedFromHashPrefix(hash: string): number {
  // Take first 8 hex chars → 32-bit int.
  return parseInt(hash.slice(0, 8), 16) >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Fallback grammar (deterministic, no AI required) ───────────────────────

const RESET_EVENTS: readonly { type: string; description: string }[] = [
  {
    type: "great_silence",
    description: "Bohové umlkli a staré sítě komunikace mezi městy se rozpadly v jediné generaci.",
  },
  {
    type: "skyfall",
    description: "Z nebe spadly hořící úlomky, spálily metropole a rozdělily kontinenty na izolované regiony.",
  },
  {
    type: "drowning",
    description: "Vody pohltily nížinné říše. Z hor se staly poslední ostrovy paměti.",
  },
  {
    type: "ash_winter",
    description: "Po staletí trvající popelová zima zničila úrodu a přerušila obchodní cesty.",
  },
  {
    type: "godwound",
    description: "Bitva mezi posledními bohy roztrhla samotnou tkáň světa a zanechala zóny, kde čas běží jinak.",
  },
];

const LINEAGE_BLUEPRINTS: readonly {
  archetype: string;
  nameTemplates: readonly string[];
  descriptionTemplate: string;
  cultural_anchor: string;
}[] = [
  {
    archetype: "thunder",
    nameTemplates: ["Děti Hromovládce", "Synové Bouře", "Plémě Blesku"],
    descriptionTemplate:
      "Linie, která tvrdí, že její zakladatelé sestoupili z hřmících oblaků v noci zlomu. Uctívají sílu a rychlé rozhodnutí.",
    cultural_anchor: "storm_cult",
  },
  {
    archetype: "drowned",
    nameTemplates: ["Strážci Utopené Síně", "Ti, kdo si pamatují vodu", "Sůl a Píseň"],
    descriptionTemplate:
      "Potomci přeživších, kteří utekli před stoupajícími vodami a zachovali si paměť na města pod hladinou.",
    cultural_anchor: "tidal_memory",
  },
  {
    archetype: "ash",
    nameTemplates: ["Dědicové Popelových Strážců", "Ti, co prošli zimou", "Nositelé Tichého Ohně"],
    descriptionTemplate:
      "Kult, který přežil dlouhou popelovou zimu díky disciplíně a tajemstvím rituálního ohně.",
    cultural_anchor: "ember_keepers",
  },
  {
    archetype: "smith",
    nameTemplates: ["Putující Kováři", "Cechovní bratrstvo Kovadliny", "Linie Tvrdé Ruky"],
    descriptionTemplate:
      "Řemeslnická linie, která drží monopol na recepty kovů zachráněné z padlých říší.",
    cultural_anchor: "guild_craft",
  },
  {
    archetype: "stormbound",
    nameTemplates: ["Bouřví", "Vázaní vichrem", "Lidé větrné přísahy"],
    descriptionTemplate:
      "Nomádi, kteří sledují vzdušné proudy a tvrdí, že vítr nese hlasy mrtvých zakladatelů.",
    cultural_anchor: "wind_oracle",
  },
  {
    archetype: "scholar",
    nameTemplates: ["Sbor Posledních Knih", "Strážci Hořkého Inkoustu", "Linie Suché Ruky"],
    descriptionTemplate:
      "Učenecká linie, která zachránila písemnosti staré civilizace a směňuje vědění za vliv.",
    cultural_anchor: "literate_caste",
  },
  {
    archetype: "warrior",
    nameTemplates: ["Železní Synové", "Žoldnéřské bratrstvo Hradby", "Ti, co drželi most"],
    descriptionTemplate:
      "Vojenská linie odvozená od posledních organizovaných oddílů staré říše. Drží paměť taktiky.",
    cultural_anchor: "martial_order",
  },
  {
    archetype: "exile",
    nameTemplates: ["Vyhnanci z Bran", "Ti bez jména", "Linie Nepojmenovaných"],
    descriptionTemplate:
      "Linie těch, kteří byli vyhnáni ze starých citadel těsně před zlomem a stali se prvními osadníky pustiny.",
    cultural_anchor: "outcast_pride",
  },
];

const MYTHIC_TAGS: readonly string[] = [
  "ruin", "altar", "leyline_node", "drowned_gate", "watchstone",
  "ash_pit", "obelisk", "broken_tower",
];

// ─── Fallback generator ─────────────────────────────────────────────────────

export function generateFallbackAncientLayer(
  seedHash: string,
  options?: { mapWidth?: number; mapHeight?: number },
): AncientLayerSpec {
  const rng = mulberry32(seedFromHashPrefix(seedHash));
  const mapW = options?.mapWidth ?? 60;
  const mapH = options?.mapHeight ?? 40;

  // Reset event
  const resetIdx = Math.floor(rng() * RESET_EVENTS.length);
  const resetBase = RESET_EVENTS[resetIdx];
  const reset_event: ResetEvent = {
    type: resetBase.type,
    description: resetBase.description,
    turn_offset: -(200 + Math.floor(rng() * 600)), // -200 to -800 turns
  };

  // Lineages: pick 5 distinct archetypes
  const archetypeIndices: number[] = [];
  const used = new Set<number>();
  while (archetypeIndices.length < 5) {
    const i = Math.floor(rng() * LINEAGE_BLUEPRINTS.length);
    if (!used.has(i)) {
      used.add(i);
      archetypeIndices.push(i);
    }
  }
  const lineage_candidates: LineageProposal[] = archetypeIndices.map((idx, i) => {
    const bp = LINEAGE_BLUEPRINTS[idx];
    return {
      id: `l${i + 1}`,
      name: pick(rng, bp.nameTemplates),
      description: bp.descriptionTemplate,
      cultural_anchor: bp.cultural_anchor,
    };
  });

  // Mythic seeds: 4–6 hex coords
  const seedCount = 4 + Math.floor(rng() * 3);
  const mythic_seeds: MythicSeed[] = [];
  const seenCoords = new Set<string>();
  let attempts = 0;
  while (mythic_seeds.length < seedCount && attempts < 50) {
    attempts++;
    const q = Math.floor(rng() * mapW) - Math.floor(mapW / 2);
    const r = Math.floor(rng() * mapH) - Math.floor(mapH / 2);
    const key = `${q},${r}`;
    if (seenCoords.has(key)) continue;
    seenCoords.add(key);
    mythic_seeds.push({
      id: `m${mythic_seeds.length + 1}`,
      hex_q: q,
      hex_r: r,
      tag: pick(rng, MYTHIC_TAGS),
    });
  }

  return {
    version: 1,
    generated_with_prompt_version: ANCIENT_PROMPT_VERSION,
    seed_hash: seedHash,
    reset_event,
    lineage_candidates,
    selected_lineages: [], // user picks in wizard; default applied client-side
    mythic_seeds,
  };
}

// ─── Default selected_lineages (per master plan: AI picks first 3) ──────────

export function defaultSelectedLineages(
  layer: AncientLayerSpec,
  count: number = 3,
): string[] {
  return layer.lineage_candidates.slice(0, count).map((l) => l.id);
}
