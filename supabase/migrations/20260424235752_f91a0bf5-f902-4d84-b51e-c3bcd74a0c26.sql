-- Dual-premise model: oddělená premisa Pradávna a Současnosti.
-- Stará 'premise' zůstává jako kanonická "současnost" (zpětná kompatibilita).
ALTER TABLE public.world_foundations
  ADD COLUMN IF NOT EXISTS pre_world_premise text,
  ADD COLUMN IF NOT EXISTS present_premise text;

COMMENT ON COLUMN public.world_foundations.pre_world_premise IS
  'Premisa Pradávna — jaký byl svět před Zlomem. Vstup pro ancient layer (rody, reset, mythic seeds).';
COMMENT ON COLUMN public.world_foundations.present_premise IS
  'Premisa Současnosti — svět po Zlomu, ve kterém začíná hra. Vstup pro worldgen spec a herní narativ.';