// Track 1 (v9.1) — Ancient Layer Zod schema (L2 enforcement).
//
// Used by translate-premise-to-spec (T1-PR2) before any write to
// world_foundations.worldgen_spec.ancient_layer.
//
// Strict mode rejects any extra top-level keys (L2 whitelist enforcement).
// Nested shape validates types of all required fields (Δ-C).

import { z } from "https://esm.sh/zod@3.25.76";

export const ResetEventSchema = z.object({
  type: z.string().min(1),
  description: z.string().min(1),
  turn_offset: z.number().int(),
}).strict();

export const LineageProposalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  cultural_anchor: z.string().optional(),
}).strict();

export const MythicSeedSchema = z.object({
  id: z.string().min(1),
  hex_q: z.number().int(),
  hex_r: z.number().int(),
  tag: z.string().min(1).regex(/^[a-z0-9_]+$/, "tag must be lowercase slug"),
}).strict();

export const AncientLayerSchema = z.object({
  version: z.literal(1),
  generated_with_prompt_version: z.number().int().positive(),
  seed_hash: z.string().min(1),
  reset_event: ResetEventSchema,
  lineage_candidates: z.array(LineageProposalSchema).min(5).max(8),
  selected_lineages: z.array(z.string().min(1)),
  mythic_seeds: z.array(MythicSeedSchema),
}).strict();

export type AncientLayerParsed = z.infer<typeof AncientLayerSchema>;

/**
 * Validates an unknown payload against the L2 whitelist + nested shape.
 * Throws ZodError on any extra key, missing field, or type mismatch.
 *
 * Track 1 enforcement layer per world-layer-contract.md §4.
 */
export function validateAncientLayer(payload: unknown): AncientLayerParsed {
  return AncientLayerSchema.parse(payload);
}
