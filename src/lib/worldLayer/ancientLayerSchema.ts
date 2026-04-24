// Browser-side mirror of supabase/functions/_shared/ancient-layer-schema.ts.
// Imported from npm zod (vs Deno esm.sh in the edge function).
// Kept manually in sync — both shapes must match exactly.

import { z } from "zod";

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

export function validateAncientLayer(payload: unknown): AncientLayerParsed {
  return AncientLayerSchema.parse(payload);
}
