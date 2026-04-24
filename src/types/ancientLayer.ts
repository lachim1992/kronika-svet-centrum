// Track 1 (v9.1) — client-side re-export of AncientLayerSpec types.
// Mirrors supabase/functions/_shared/ancient-layer-types.ts.
// Kept manually in sync — both sides must match exactly.

export interface ResetEvent {
  type: string;
  description: string;
  turn_offset: number;
}

export interface LineageProposal {
  id: string;
  name: string;
  description: string;
  cultural_anchor?: string;
}

export interface MythicSeed {
  id: string;
  hex_q: number;
  hex_r: number;
  tag: string;
}

export interface AncientLayerSpec {
  version: 1;
  generated_with_prompt_version: number;
  seed_hash: string;
  reset_event: ResetEvent;
  lineage_candidates: LineageProposal[];
  selected_lineages: string[];
  mythic_seeds: MythicSeed[];
}
