-- Add academy_type to academies (sphaera/olympic/gladiator)
ALTER TABLE public.academies 
  ADD COLUMN IF NOT EXISTS academy_type text NOT NULL DEFAULT 'olympic';

-- Set academy_type based on existing is_gladiatorial flag and association_id
UPDATE public.academies a SET academy_type = 'gladiator' WHERE a.is_gladiatorial = true;
UPDATE public.academies a SET academy_type = sa.association_type 
  FROM public.sports_associations sa 
  WHERE a.association_id = sa.id AND a.is_gladiatorial = false;

-- Add graduate_type to academy_students
ALTER TABLE public.academy_students 
  ADD COLUMN IF NOT EXISTS graduate_type text NOT NULL DEFAULT 'athlete';

-- Backfill graduate_type from academy's type
UPDATE public.academy_students s SET graduate_type = 
  CASE 
    WHEN a.academy_type = 'sphaera' THEN 'sphaera_player'
    WHEN a.academy_type = 'gladiator' THEN 'gladiator'
    ELSE 'athlete'
  END
FROM public.academies a WHERE s.academy_id = a.id;