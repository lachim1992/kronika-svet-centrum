-- Canonical visual for predefined building templates.
-- The generated image batch is stored in Supabase Storage; this keeps the
-- template-to-image mapping in the same row that drives "Postavit budovu".
ALTER TABLE public.building_templates
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.building_templates.image_url IS
  'Public URL of the canonical building illustration used by the catalog, city cards, and map.';

-- Existing city buildings inherit the catalog visual once it is available.
UPDATE public.city_buildings cb
SET image_url = bt.image_url
FROM public.building_templates bt
WHERE cb.template_id = bt.id
  AND cb.image_url IS NULL
  AND bt.image_url IS NOT NULL;
