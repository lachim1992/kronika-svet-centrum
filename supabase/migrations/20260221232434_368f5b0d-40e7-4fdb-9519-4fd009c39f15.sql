
-- Add province coordinates to cities
ALTER TABLE public.cities ADD COLUMN province_q integer;
ALTER TABLE public.cities ADD COLUMN province_r integer;

-- Add unique constraint per session (no two cities share same coords)
CREATE UNIQUE INDEX idx_cities_province_coords ON public.cities (session_id, province_q, province_r) WHERE province_q IS NOT NULL AND province_r IS NOT NULL;
