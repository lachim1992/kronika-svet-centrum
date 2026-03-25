ALTER TABLE public.realm_resources 
ADD COLUMN IF NOT EXISTS computed_modifiers jsonb DEFAULT '{}'::jsonb;