
UPDATE public.league_teams
SET team_name = team_name || ' (B)'
WHERE id = '8d5434b4-52df-44f4-9c20-abffcdac3eda';

ALTER TABLE public.league_teams
  ADD CONSTRAINT league_teams_session_team_name_unique UNIQUE (session_id, team_name);

UPDATE public.military_stacks
SET moved_this_turn = false
WHERE session_id = '0de6fab4-b925-4faf-bced-14ec85730f45';
