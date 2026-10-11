-- Access-rule hardening 2026-10-11. Idempotent; data untouched.
-- 1) No public (anon) route exists: anon gets no table/view access at all.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- 2) Views must not bypass RLS of their base tables; unused by the client.
ALTER VIEW public.chronicle_source SET (security_invoker = true);
ALTER VIEW public.v_route_with_state SET (security_invoker = true);
REVOKE ALL ON public.chronicle_source, public.v_route_with_state FROM authenticated;

-- 3) Membership / ownership helpers (definer, fixed search_path, authenticated only).
CREATE OR REPLACE FUNCTION app_private.is_realm_owner(_session_id uuid, _player text, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT _user_id IS NOT NULL AND (public.has_role(_user_id,'admin'::public.app_role) OR EXISTS(
    SELECT 1 FROM public.game_players gp WHERE gp.session_id=_session_id AND gp.user_id=_user_id
      AND lower(gp.player_name)=lower(_player)))
$$;
CREATE OR REPLACE FUNCTION app_private.shares_session(_other uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT _user_id IS NOT NULL AND (_other=_user_id OR EXISTS(
    SELECT 1 FROM public.game_players a JOIN public.game_players b ON a.session_id=b.session_id
    WHERE a.user_id=_user_id AND b.user_id=_other))
$$;
REVOKE ALL ON FUNCTION app_private.is_realm_owner(uuid,text,uuid), app_private.shares_session(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.is_realm_owner(uuid,text,uuid), app_private.shares_session(uuid,uuid) TO authenticated, service_role;

-- Realm names are matched case-insensitively, so they must be unique case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS game_players_session_lower_name_key ON public.game_players(session_id, lower(player_name));

-- 4) Internal projections, journals, locks, AI state, telemetry: service_role only.
DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['academy_rankings','ai_war_plans','ai_world_summaries','chronicle_mentions','city_capital_stock','city_economic_role_metrics','city_good_balances','city_hinterland_assignments','cultures','economy_recompute_locks','economy_turn_ledgers','famous_good_history','famous_goods','games_qualifications','languages','map_visibility','market_shares','neutral_trade_pacts','node_economy_history','node_flow_state','realm_heritage','route_state','rumor_generation_log','structure_production_orders','trade_system_node_snapshot','turn_briefings','turn_digests','turn_execution_guards','turn_phase_journal','wiki_entry_versions','wiki_event_refs','wonder_draft_images','world_layer_tick_guards','world_routes'] LOOP
  FOR p IN SELECT polname FROM pg_policy WHERE polrelid=format('public.%I',t)::regclass LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.polname,t);
  END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;

-- 5) Server-written tables the client only reads: session-member SELECT, no client writes.
DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['ai_faction_turn_summary','ai_invocation_log','basket_trade_flows','battles','city_districts','city_market_baskets','city_market_summary','civ_influence','civ_tensions','council_evaluations','demand_baskets','diplomatic_memory','diplomatic_pacts','diplomatic_relations','entity_links','entity_stats','event_entity_links','faction_intents','game_records','game_style_settings','games_bids','games_discipline_reveals','games_incidents','games_intrigues','games_live_feed','games_participants','games_results','generals','gladiator_records','heritage_effects','league_matches','league_seasons','league_standings','macro_regions','node_blockades','node_influence','node_inventory','node_migrations','node_production_orders','node_projects','node_trade_links','player_trade_system_access','province_adjacency','province_control_snapshots','road_projects','road_segments','rumors','settlement_resource_profiles','sphaera_feed_items','supply_chain_state','tile_infrastructure','tile_parcel_contents','tile_parcels','time_pools','trade_flows','trade_system_basket_supply','trade_systems','travel_routes','turn_summaries','unit_type_visuals','world_crises','world_node_outputs','world_premise','world_tick_log'] LOOP
  FOR p IN SELECT polname, pg_get_expr(polqual,polrelid) AS qual FROM pg_policy
           WHERE polrelid=format('public.%I',t)::regclass AND polcmd='*' LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.polname,t);
   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_member_read',t);
   EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',t||'_member_read',t,p.qual);
  END LOOP;
  EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;

-- 6) Reference catalogue: authenticated read-only.
DROP POLICY IF EXISTS "Public read building templates" ON public.building_templates;
DROP POLICY IF EXISTS building_templates_authenticated_read ON public.building_templates;
CREATE POLICY building_templates_authenticated_read ON public.building_templates FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.building_templates FROM authenticated;
GRANT SELECT ON public.building_templates TO authenticated;

-- 7) realm_resources: members read shared board state; treasury/fiscal columns are backend-only.
DROP POLICY IF EXISTS realm_resources_session_member_access ON public.realm_resources;
DROP POLICY IF EXISTS realm_resources_member_read ON public.realm_resources;
DROP POLICY IF EXISTS realm_resources_owner_flags ON public.realm_resources;
CREATE POLICY realm_resources_member_read ON public.realm_resources FOR SELECT TO authenticated USING (app_private.is_session_member(session_id));
CREATE POLICY realm_resources_owner_flags ON public.realm_resources FOR UPDATE TO authenticated
  USING (app_private.is_realm_owner(session_id, player_name)) WITH CHECK (app_private.is_realm_owner(session_id, player_name));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.realm_resources FROM authenticated;
GRANT SELECT ON public.realm_resources TO authenticated;
GRANT UPDATE (mobilization_rate, army_sigil_confirmed) ON public.realm_resources TO authenticated;

-- 8) game_sessions: members/creator read; creator stamped; turn columns backend-only.
ALTER TABLE public.game_sessions ALTER COLUMN created_by SET DEFAULT auth.uid();
DROP POLICY IF EXISTS game_sessions_authenticated_read ON public.game_sessions;
DROP POLICY IF EXISTS game_sessions_authenticated_create ON public.game_sessions;
DROP POLICY IF EXISTS game_sessions_member_update ON public.game_sessions;
DROP POLICY IF EXISTS game_sessions_member_delete ON public.game_sessions;
DROP POLICY IF EXISTS game_sessions_member_read ON public.game_sessions;
DROP POLICY IF EXISTS game_sessions_creator_create ON public.game_sessions;
DROP POLICY IF EXISTS game_sessions_member_lobby_update ON public.game_sessions;
DROP POLICY IF EXISTS game_sessions_creator_delete ON public.game_sessions;
CREATE POLICY game_sessions_member_read ON public.game_sessions FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR app_private.is_session_member(id));
CREATE POLICY game_sessions_creator_create ON public.game_sessions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY game_sessions_member_lobby_update ON public.game_sessions FOR UPDATE TO authenticated
  USING (app_private.is_session_member(id)) WITH CHECK (app_private.is_session_member(id));
CREATE POLICY game_sessions_creator_delete ON public.game_sessions FOR DELETE TO authenticated
  USING (created_by = auth.uid());
REVOKE UPDATE ON public.game_sessions FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.game_sessions TO authenticated;
GRANT UPDATE (player1_name, player2_name, epoch_style, max_players, init_status, init_step,
  victory_status, victory_winner, victory_data, current_era, game_mode, tier) ON public.game_sessions TO authenticated;

CREATE OR REPLACE FUNCTION public.find_session_by_room_code(p_code text)
RETURNS TABLE(id uuid, max_players integer, player_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT g.id, g.max_players, (SELECT count(*)::int FROM public.game_players gp WHERE gp.session_id=g.id)
  FROM public.game_sessions g WHERE auth.uid() IS NOT NULL AND g.room_code=upper(trim(p_code)) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.find_session_by_room_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_session_by_room_code(text) TO authenticated;

-- 9) game_players: only the own turn_closed flag is client-writable.
REVOKE UPDATE ON public.game_players FROM authenticated;
GRANT UPDATE (turn_closed) ON public.game_players TO authenticated;

-- 10) game_memberships: own rows only for writes.
DROP POLICY IF EXISTS game_memberships_session_member_access ON public.game_memberships;
DROP POLICY IF EXISTS game_memberships_self_insert ON public.game_memberships;
DROP POLICY IF EXISTS game_memberships_self_delete ON public.game_memberships;
CREATE POLICY game_memberships_self_insert ON public.game_memberships FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY game_memberships_self_delete ON public.game_memberships FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE UPDATE, TRUNCATE ON public.game_memberships FROM authenticated;

-- 11) profiles: yourself and players you share a session with.
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;
DROP POLICY IF EXISTS profiles_shared_session_read ON public.profiles;
CREATE POLICY profiles_shared_session_read ON public.profiles FOR SELECT TO authenticated USING (app_private.shares_session(id));

-- 12) Public buckets are served by URL; listing is not needed (uploads are server-side).
DROP POLICY IF EXISTS "Wonder images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Building images are publicly accessible" ON storage.objects;
