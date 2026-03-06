
ALTER TABLE public.academies ADD COLUMN association_id uuid REFERENCES public.sports_associations(id) ON DELETE SET NULL;
CREATE INDEX idx_academies_association_id ON public.academies(association_id);
