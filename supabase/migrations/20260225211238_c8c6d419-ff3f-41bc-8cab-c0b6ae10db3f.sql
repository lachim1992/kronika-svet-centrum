-- Create storage bucket for building images
INSERT INTO storage.buckets (id, name, public) VALUES ('building-images', 'building-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Building images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'building-images');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload building images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'building-images' AND auth.role() = 'authenticated');
