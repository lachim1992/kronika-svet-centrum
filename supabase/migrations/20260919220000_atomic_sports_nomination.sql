-- Replace a nomination as one transaction; failures retain the previous team.
CREATE OR REPLACE FUNCTION public.replace_games_nomination(
  p_session_id uuid, p_festival_id uuid, p_player_name text, p_participants jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.games_festivals%ROWTYPE; ids uuid[]; n integer; valid_count integer;
BEGIN
  SELECT * INTO f FROM games_festivals WHERE id = p_festival_id AND session_id = p_session_id FOR UPDATE;
  IF NOT FOUND OR f.status NOT IN ('nomination', 'candidacy') THEN
    RAISE EXCEPTION 'Festival není ve fázi nominace';
  END IF;
  IF jsonb_typeof(p_participants) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Neplatná nominace'; END IF;
  n := jsonb_array_length(p_participants);
  SELECT array_agg(DISTINCT (x->>'student_id')::uuid) INTO ids FROM jsonb_array_elements(p_participants) x;
  IF n < 1 OR n > 3 OR cardinality(ids) <> n OR array_position(ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Vyberte 1 až 3 různé sportovce';
  END IF;
  PERFORM id FROM academy_students WHERE id = ANY(ids) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO valid_count FROM academy_students
    WHERE id = ANY(ids) AND session_id = p_session_id AND player_name = p_player_name
      AND status IN ('graduated', 'promoted');
  IF valid_count <> n THEN RAISE EXCEPTION 'Sportovci nejsou dostupní'; END IF;

  UPDATE academy_students SET status = 'graduated'
    WHERE session_id = p_session_id AND player_name = p_player_name AND status = 'promoted'
      AND id IN (SELECT student_id FROM games_participants WHERE festival_id = p_festival_id AND player_name = p_player_name);
  DELETE FROM games_participants WHERE festival_id = p_festival_id AND player_name = p_player_name;
  INSERT INTO games_participants (session_id, festival_id, player_name, city_id, athlete_name, student_id,
    strength, endurance, agility, tactics, charisma, training_bonus, city_infrastructure_bonus, civ_modifier, traits, form, background)
  SELECT p_session_id, p_festival_id, p_player_name, r.city_id, s.name, s.id,
    s.strength, s.endurance, s.agility, s.tactics, s.charisma, r.training_bonus, r.city_infrastructure_bonus,
    r.civ_modifier, s.traits, 'peak', s.bio
  FROM jsonb_to_recordset(p_participants) AS r(student_id uuid, city_id uuid, training_bonus numeric, city_infrastructure_bonus numeric, civ_modifier numeric)
  JOIN academy_students s ON s.id = r.student_id;
  UPDATE academy_students SET status = 'promoted' WHERE id = ANY(ids);
  UPDATE games_qualifications SET selected = (student_id = ANY(ids))
    WHERE festival_id = p_festival_id AND player_name = p_player_name;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_games_nomination(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_games_nomination(uuid, uuid, text, jsonb) TO service_role;
