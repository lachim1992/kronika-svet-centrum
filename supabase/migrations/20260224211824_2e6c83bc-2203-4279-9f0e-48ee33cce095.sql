-- Add exceptional_prompt column for player's custom description of what makes the person special
ALTER TABLE public.great_persons ADD COLUMN IF NOT EXISTS exceptional_prompt text;