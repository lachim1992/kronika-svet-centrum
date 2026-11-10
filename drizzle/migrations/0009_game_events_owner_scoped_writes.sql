-- game_events: members read; clients may only write their OWN narrative events. Mechanical, server-resolved
-- event types, command-sourced rows and processing markers are service_role-only (edge functions bypass RLS).
CREATE OR REPLACE FUNCTION public.guard_client_game_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role','') <> 'authenticated' THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN RETURN NEW; END IF;
  IF NEW.command_id IS NOT NULL OR NEW.processed_at IS NOT NULL OR NEW.processing_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'command/processed events are server-written' USING ERRCODE='42501';
  END IF;
  IF NEW.event_type IN ('city_growth','famine','migration','settlement_growth','settlement_upgrade','battle_outcome','battle_incoming',
     'city_occupied','city_annexed','rebellion','uprising','sphaera_death','mobilization_pressure','supply_strained',
     'trade_route_severed','plague','wonder_built','chronicle_generation','crisis','trade_boom','node_joined_trade_system',
     'trade_link_opened','source_import','route_completed','army_retreated','games_concluded') THEN
    RAISE EXCEPTION 'event type % is server-resolved', NEW.event_type USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.player IS DISTINCT FROM OLD.player
     OR NEW.event_type IS DISTINCT FROM OLD.event_type OR NEW.turn_number IS DISTINCT FROM OLD.turn_number
     OR NEW.truth_state IS DISTINCT FROM OLD.truth_state) THEN
    RAISE EXCEPTION 'identity fields of an event are immutable for clients' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_client_game_event ON public.game_events;
CREATE TRIGGER trg_guard_client_game_event BEFORE INSERT OR UPDATE ON public.game_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_game_event();

DROP POLICY IF EXISTS game_events_session_member_access ON public.game_events;
DROP POLICY IF EXISTS game_events_member_read ON public.game_events;
DROP POLICY IF EXISTS game_events_owner_insert ON public.game_events;
DROP POLICY IF EXISTS game_events_owner_update ON public.game_events;
DROP POLICY IF EXISTS game_events_admin_delete ON public.game_events;
CREATE POLICY game_events_member_read ON public.game_events FOR SELECT TO authenticated USING (app_private.is_session_member(session_id));
CREATE POLICY game_events_owner_insert ON public.game_events FOR INSERT TO authenticated
  WITH CHECK (app_private.is_session_member(session_id) AND (app_private.is_realm_owner(session_id, player) OR public.has_role(auth.uid(),'admin'::public.app_role)));
CREATE POLICY game_events_owner_update ON public.game_events FOR UPDATE TO authenticated
  USING (app_private.is_session_member(session_id) AND (app_private.is_realm_owner(session_id, player) OR public.has_role(auth.uid(),'admin'::public.app_role)))
  WITH CHECK (app_private.is_session_member(session_id) AND (app_private.is_realm_owner(session_id, player) OR public.has_role(auth.uid(),'admin'::public.app_role)));
CREATE POLICY game_events_admin_delete ON public.game_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));