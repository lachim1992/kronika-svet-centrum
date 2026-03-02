
-- Add style_key column to map_gen_preferences for per-style learning
ALTER TABLE public.map_gen_preferences 
ADD COLUMN IF NOT EXISTS style_key text NOT NULL DEFAULT 'global';

-- Drop old unique constraint on user_id only
ALTER TABLE public.map_gen_preferences 
DROP CONSTRAINT IF EXISTS map_gen_preferences_user_id_key;

-- Create new unique constraint on (user_id, style_key)
ALTER TABLE public.map_gen_preferences 
ADD CONSTRAINT map_gen_preferences_user_id_style_key_key UNIQUE (user_id, style_key);

-- Also add style_key to feedback table for tracking
ALTER TABLE public.map_gen_feedback
ADD COLUMN IF NOT EXISTS style_key text DEFAULT 'global';
