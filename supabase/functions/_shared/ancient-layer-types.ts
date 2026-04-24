// Track 1 (v9.1) — Ancient Layer types.
// Optional jsonb extension stored under world_foundations.worldgen_spec.ancient_layer.
//
// Field whitelist is locked by docs/architecture/world-layer-contract.md §4 (L2).
// AncientLayerSpec is intentionally a CLOSED interface (no index signature).
// Adding fields here without updating the contract is a Normative violation.

export interface ResetEvent {
  /** Short machine identifier, e.g. "great_silence", "skyfall", "drowning". */
  type: string;
  /** Human-readable mythic prequel description (1–3 sentences). */
  description: string;
  /**
   * Offset in turns from the mythic event to turn 1.
   * Negative values describe how long ago the reset occurred.
   */
  turn_offset: number;
}

export interface LineageProposal {
  /** Stable ID derived from seed_hash + index, used in selected_lineages[]. */
  id: string;
  /** Display name, e.g. "Children of the Thunderlord". */
  name: string;
  /** One-paragraph identity flavor. */
  description: string;
  /** Optional cultural anchor (region biome, founding myth keyword, etc). */
  cultural_anchor?: string;
}

export interface MythicSeed {
  /** Stable ID derived from seed_hash + index. */
  id: string;
  /** Hex coordinate (axial). */
  hex_q: number;
  /** Hex coordinate (axial). */
  hex_r: number;
  /**
   * Categorization tag for future Track 2 mythic-node spawn (e.g. "ruin",
   * "altar", "leyline_node"). Must be a short slug, never narrative text.
   */
  tag: string;
}

/**
 * Closed contract — adding a field here without amending
 * docs/architecture/world-layer-contract.md §4 is a Normative violation.
 */
export interface AncientLayerSpec {
  version: 1;
  /** Prompt template version that generated this layer (K3 determinism). */
  generated_with_prompt_version: number;
  /** Hash of the world seed inputs (K3 determinism). */
  seed_hash: string;
  reset_event: ResetEvent;
  /** 5–8 AI-proposed founding lineages. */
  lineage_candidates: LineageProposal[];
  /** Subset of lineage_candidates[].id values confirmed by the user. */
  selected_lineages: string[];
  /** Hex coordinates + tags reserved for future mythic node spawn (Track 2). */
  mythic_seeds: MythicSeed[];
}
