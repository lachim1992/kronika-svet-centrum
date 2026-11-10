-- see file body
DO $$
DECLARE
  spec record; pol record; pred text;
BEGIN
  FOR spec IN SELECT * FROM (VALUES
    ('academies','app_private.is_realm_owner(session_id, player_name)'),
    ('academy_students','app_private.is_realm_owner(session_id, player_name)'),
    ('action_queue','app_private.is_realm_owner(session_id, player_name)'),
    ('ai_factions','app_private.is_realm_owner(session_id, faction_name)'),
    ('battle_lobbies','(app_private.is_realm_owner(session_id, attacker_player) OR app_private.is_realm_owner(session_id, defender_player))'),
    ('cities','app_private.is_realm_owner(session_id, owner_player)'),
    ('city_buildings','EXISTS (SELECT 1 FROM public.cities c WHERE c.id = city_id AND app_private.is_realm_owner(c.session_id, c.owner_player))'),
    ('city_factions','EXISTS (SELECT 1 FROM public.cities c WHERE c.id = city_id AND app_private.is_realm_owner(c.session_id, c.owner_player))'),
    ('city_policies','EXISTS (SELECT 1 FROM public.cities c WHERE c.id = city_id AND app_private.is_realm_owner(c.session_id, c.owner_player))'),
    ('city_uprisings','app_private.is_realm_owner(session_id, player_name)'),
    ('civ_identity','app_private.is_realm_owner(session_id, player_name)'),
    ('civilizations','app_private.is_realm_owner(session_id, player_name)'),
    ('countries','app_private.is_realm_owner(session_id, ruler_player)'),
    ('declarations','app_private.is_realm_owner(session_id, player_name)'),
    ('discoveries','app_private.is_realm_owner(session_id, player_name)'),
    ('entity_contributions','app_private.is_realm_owner(session_id, author_player)'),
    ('expeditions','app_private.is_realm_owner(session_id, player_name)'),
    ('feed_comments','app_private.is_realm_owner(session_id, player_name)'),
    ('feed_reactions','app_private.is_realm_owner(session_id, player_name)'),
    ('game_chat','app_private.is_realm_owner(session_id, player_name)'),
    ('games_comments','app_private.is_realm_owner(session_id, player_name)'),
    ('great_persons','app_private.is_realm_owner(session_id, player_name)'),
    ('laws','app_private.is_realm_owner(session_id, player_name)'),
    ('league_teams','app_private.is_realm_owner(session_id, player_name)'),
    ('military_capacity','app_private.is_realm_owner(session_id, player_name)'),
    ('military_stacks','app_private.is_realm_owner(session_id, player_name)'),
    ('player_activity','app_private.is_realm_owner(session_id, player_name)'),
    ('player_chronicle_chapters','app_private.is_realm_owner(session_id, player_name)'),
    ('player_civ_configs','app_private.is_realm_owner(session_id, player_name)'),
    ('player_resources','app_private.is_realm_owner(session_id, player_name)'),
    ('player_watches','app_private.is_realm_owner(session_id, player_name)'),
    ('province_hexes','app_private.is_realm_owner(session_id, owner_player)'),
    ('province_nodes','app_private.is_realm_owner(session_id, controlled_by)'),
    ('province_routes','app_private.is_realm_owner(session_id, controlled_by)'),
    ('provinces','app_private.is_realm_owner(session_id, owner_player)'),
    ('realm_infrastructure','app_private.is_realm_owner(session_id, player_name)'),
    ('regions','app_private.is_realm_owner(session_id, owner_player)'),
    ('saga_versions','app_private.is_realm_owner(session_id, author_player)'),
    ('secret_objectives','app_private.is_realm_owner(session_id, player_name)'),
    ('sports_associations','app_private.is_realm_owner(session_id, player_name)'),
    ('travel_orders','app_private.is_realm_owner(session_id, player_name)'),
    ('war_declarations','app_private.is_realm_owner(session_id, declaring_player)'),
    ('wonders','app_private.is_realm_owner(session_id, owner_player)'),
    ('world_action_log','app_private.is_realm_owner(session_id, player_name)'),
    ('trade_offers','app_private.is_realm_owner(session_id, from_player) OR app_private.is_realm_owner(session_id, to_player)'),
    ('trade_routes','app_private.is_realm_owner(session_id, from_player) OR app_private.is_realm_owner(session_id, to_player)'),
    ('diplomatic_treaties','app_private.is_realm_owner(session_id, player_a) OR app_private.is_realm_owner(session_id, player_b)'),
    ('games_festivals','app_private.is_realm_owner(session_id, host_player)')
  ) AS v(tbl, owner_pred) LOOP
    pred := format('((%s) OR public.has_role(auth.uid(), ''admin''::public.app_role))', spec.owner_pred);
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=spec.tbl AND cmd='ALL'
      AND qual='app_private.is_session_member(session_id)' LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, spec.tbl);
    END LOOP;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', spec.tbl||'_member_read', spec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', spec.tbl||'_owner_insert', spec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', spec.tbl||'_owner_update', spec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', spec.tbl||'_owner_delete', spec.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (app_private.is_session_member(session_id))', spec.tbl||'_member_read', spec.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (app_private.is_session_member(session_id) AND %s)', spec.tbl||'_owner_insert', spec.tbl, pred);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (app_private.is_session_member(session_id) AND %s) WITH CHECK (app_private.is_session_member(session_id) AND %s)', spec.tbl||'_owner_update', spec.tbl, pred, pred);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (app_private.is_session_member(session_id) AND %s)', spec.tbl||'_owner_delete', spec.tbl, pred);
  END LOOP;
END $$;