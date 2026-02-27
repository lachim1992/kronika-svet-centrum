
-- Add province_id to province_hexes so each hex belongs to a province
ALTER TABLE public.province_hexes ADD COLUMN IF NOT EXISTS province_id uuid REFERENCES public.provinces(id);

-- Add center coordinates and color index to provinces
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS center_q integer DEFAULT 0;
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS center_r integer DEFAULT 0;
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS color_index integer DEFAULT 0;
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS is_neutral boolean DEFAULT false;
ALTER TABLE public.provinces ADD COLUMN IF NOT EXISTS npc_city_state_id uuid REFERENCES public.city_states(id);

-- Index for fast hex->province lookup
CREATE INDEX IF NOT EXISTS idx_province_hexes_province_id ON public.province_hexes(province_id);
CREATE INDEX IF NOT EXISTS idx_province_hexes_session_coords ON public.province_hexes(session_id, q, r);
