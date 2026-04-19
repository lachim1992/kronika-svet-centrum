// Canonical world presets for the World Setup Wizard (Inkrement 2).
// 3 MVP presets — each defines defaults for terrain, tone, victory style,
// and a premise placeholder. Selection is non-destructive: dirty fields
// (manually edited by the user) are preserved (see useWizardDirtyState).

import type { WorldSize } from "@/types/worldBootstrap";

export type PresetId = "recommended" | "archipelago" | "great_continent";

export interface WorldPreset {
  id: PresetId;
  label: string;
  icon: string;
  description: string;
  defaults: {
    tone: string;
    victoryStyle: string;
    size: WorldSize;
    premisePlaceholder: string;
    terrain: {
      targetLandRatio: number;
      continentShape: string;
      continentCount: number;
      mountainDensity: number;
    };
  };
}

export const WORLD_PRESETS: WorldPreset[] = [
  {
    id: "recommended",
    label: "Doporučený",
    icon: "🌍",
    description: "Vyvážený svět s pevninou i pobřežím. Dobrý start.",
    defaults: {
      tone: "realistic",
      victoryStyle: "story",
      size: "medium",
      premisePlaceholder:
        "Mladý svět na úsvitu civilizací. Národy se teprve usazují, hranice jsou neostré a budoucnost otevřená...",
      terrain: {
        targetLandRatio: 0.45,
        continentShape: "mixed",
        continentCount: 2,
        mountainDensity: 0.3,
      },
    },
  },
  {
    id: "archipelago",
    label: "Souostroví",
    icon: "🏝️",
    description: "Roztroušené ostrovy. Námořní obchod a expanze.",
    defaults: {
      tone: "mythic",
      victoryStyle: "story",
      size: "medium",
      premisePlaceholder:
        "Stovky ostrovů spojené mořskými cestami. Každá zátoka skrývá obchod, pirátství nebo zapomenutý chrám...",
      terrain: {
        targetLandRatio: 0.3,
        continentShape: "archipelago",
        continentCount: 5,
        mountainDensity: 0.2,
      },
    },
  },
  {
    id: "great_continent",
    label: "Velký kontinent",
    icon: "🗻",
    description: "Jediná masivní pevnina. Sousedské hranice a horské průsmyky.",
    defaults: {
      tone: "realistic",
      victoryStyle: "domination",
      size: "large",
      premisePlaceholder:
        "Jediná velká pevnina pod nebesy. Říše rostou bok po boku, hory dělí kultury a každá řeka je hranicí...",
      terrain: {
        targetLandRatio: 0.65,
        continentShape: "pangaea",
        continentCount: 1,
        mountainDensity: 0.4,
      },
    },
  },
];

export const DEFAULT_PRESET_ID: PresetId = "recommended";

export function getPreset(id: PresetId): WorldPreset {
  return WORLD_PRESETS.find((p) => p.id === id) ?? WORLD_PRESETS[0];
}
