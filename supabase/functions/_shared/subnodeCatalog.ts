/**
 * Buildable subnodes (territorial objects placed on a held parcel).
 *
 * Canonical single definition: command-dispatch validates against it and the
 * construction UI explains it from the very same numbers.
 */
export interface SubnodeDef {
  label: string; nodeType: string; group: string; gold: number; production: number;
  resource: Record<string, number>; capabilities: string[]; role: string;
  /** River or coast required (validated server-side). */
  requiresWater?: boolean;
  description: string;
}

export const SUBNODE_DEFS: Record<string, SubnodeDef> = {
  farmstead: { label: "Produkční dvůr", nodeType: "resource_node", group: "production", gold: 35, production: 45, resource: { supplies: 4, production: 2 }, capabilities: ["farming", "herding", "milling"], role: "source",
    description: "Dvůr s poli a pastvinami mimo město — pěstuje a chová, dodává surovinu do okolí." },
  workshop: { label: "Řemeslná dílna", nodeType: "resource_node", group: "production", gold: 45, production: 55, resource: { production: 5, wealth: 1 }, capabilities: ["crafting", "smithing", "toolmaking", "smelting", "stonecutting"], role: "processing",
    description: "Dílna na zpracování surovin — kov, kámen a nástroje." },
  guard_post: { label: "Strážnice", nodeType: "fortress", group: "military", gold: 50, production: 65, resource: {}, capabilities: ["garrison"], role: "control",
    description: "Drží pole pod kontrolou a chrání trasy, sama nic nevyrábí." },
  trade_post: { label: "Obchodní stanice", nodeType: "trade_hub", group: "trade", gold: 70, production: 40, resource: { wealth: 5 }, capabilities: ["trade_access", "storage", "construction"], role: "producer",
    description: "Napojuje okolí na obchod, skladuje a přeprodává." },
  river_wharf: { label: "Říční překladiště", nodeType: "port", group: "trade", gold: 80, production: 60, resource: { wealth: 4, supplies: 1 }, capabilities: ["shipping", "storage", "fishing"], role: "source",
    requiresWater: true,
    description: "Překládá náklad na vodu — levná doprava po řece nebo u pobřeží." },
};
