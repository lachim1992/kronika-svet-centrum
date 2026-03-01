
-- Add UNIQUE constraint to prevent duplicate results
ALTER TABLE public.games_results
  ADD CONSTRAINT games_results_unique_entry
  UNIQUE (festival_id, discipline_id, participant_id);
