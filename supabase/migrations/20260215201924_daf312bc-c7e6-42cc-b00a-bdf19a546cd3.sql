
-- Add image_url to wonders for the official portrait
ALTER TABLE public.wonders ADD COLUMN IF NOT EXISTS image_url text;

-- Create wonder_draft_images table for candidate portraits
CREATE TABLE public.wonder_draft_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wonder_id uuid NOT NULL REFERENCES public.wonders(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  image_prompt text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.wonder_draft_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to wonder draft images"
ON public.wonder_draft_images
FOR ALL
USING (true)
WITH CHECK (true);

-- Create storage bucket for wonder images
INSERT INTO storage.buckets (id, name, public) VALUES ('wonder-images', 'wonder-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for wonder images
CREATE POLICY "Wonder images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'wonder-images');

-- Anyone can upload wonder images (no auth in this game)
CREATE POLICY "Anyone can upload wonder images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'wonder-images');

-- Anyone can update wonder images
CREATE POLICY "Anyone can update wonder images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'wonder-images');

-- Anyone can delete wonder images
CREATE POLICY "Anyone can delete wonder images"
ON storage.objects FOR DELETE
USING (bucket_id = 'wonder-images');
