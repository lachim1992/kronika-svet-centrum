-- Construction material sub-ledger of realm_resources.production_reserve (ADDITIVE, forward-only).
-- No second spending channel: wood/stone goods were already consumed as goodsEconomy capex and
-- accrued 1:1 into production_reserve. This only attributes that reserve to its material and
-- records which building drew which units. Mirror: supabase/functions/_shared/constructionMaterials.ts

ALTER TABLE public.realm_resources
  ADD COLUMN IF NOT EXISTS construction_reserve_composition jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.realm_resources.construction_reserve_composition IS
  'Attribution of production_reserve by material {wood,stone,mixed,unattributed}; sum = production_reserve. Written only by process-turn accrual and allocate/release_construction_reserve.';

CREATE TABLE IF NOT EXISTS public.construction_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  command_id text NOT NULL,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  building_id uuid NULL,
  turn_number integer NOT NULL CHECK (turn_number >= 0),
  requirement jsonb NOT NULL,
  draws jsonb NOT NULL,
  gold_paid numeric NOT NULL CHECK (gold_paid >= 0),
  production_paid numeric NOT NULL CHECK (production_paid >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','committed','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT construction_allocations_command_unique UNIQUE (session_id, command_id)
);
CREATE INDEX IF NOT EXISTS construction_allocations_session_idx ON public.construction_allocations(session_id, player_name);

GRANT SELECT ON public.construction_allocations TO authenticated;
GRANT ALL ON public.construction_allocations TO service_role;
ALTER TABLE public.construction_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Session members read construction allocations" ON public.construction_allocations;
CREATE POLICY "Session members read construction allocations" ON public.construction_allocations
  FOR SELECT TO authenticated USING (app_private.is_session_member(session_id));

-- Normalize composition so that it sums exactly to the reserve (proportional for unnamed spends).
CREATE OR REPLACE FUNCTION public.construction_composition_normalize(p_comp jsonb, p_reserve numeric)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  r numeric := GREATEST(coalesce(p_reserve,0),0);
  w numeric := GREATEST(coalesce((p_comp->>'wood')::numeric,0),0);
  s numeric := GREATEST(coalesce((p_comp->>'stone')::numeric,0),0);
  m numeric := GREATEST(coalesce((p_comp->>'mixed')::numeric,0),0);
  u numeric := GREATEST(coalesce((p_comp->>'unattributed')::numeric,0),0);
  f numeric;
BEGIN
  IF w+s+m+u <= r + 0.000001 THEN
    RETURN jsonb_build_object('wood',w,'stone',s,'mixed',m,'unattributed',GREATEST(r-w-s-m,0));
  END IF;
  f := CASE WHEN w+s+m+u > 0 THEN r/(w+s+m+u) ELSE 0 END;
  w := round(w*f,6); s := round(s*f,6); m := round(m*f,6);
  RETURN jsonb_build_object('wood',w,'stone',s,'mixed',m,'unattributed',GREATEST(r-w-s-m,0));
END $$;

-- Atomic: validates turn + city ownership, debits gold + production, draws per material from the
-- attributed reserve (wood: wood→mixed→unattributed; stone: stone→mixed→unattributed;
-- iron: unattributed→mixed→wood→stone = pooled points, no physical iron), records the allocation.
-- Idempotent by (session, command): a retry returns the original allocation, never charges twice.
CREATE OR REPLACE FUNCTION public.allocate_construction_reserve(
  p_session uuid, p_command text, p_player text, p_city uuid, p_turn integer,
  p_gold numeric, p_wood numeric, p_stone numeric, p_iron numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prior construction_allocations%ROWTYPE;
  rr record; cur integer; comp jsonb; left_ jsonb; draws jsonb := '{}'::jsonb;
  mat text; need numeric; b text; take numeric; avail numeric; md jsonb; total numeric;
  orders jsonb := '{"wood":["wood","mixed","unattributed"],"stone":["stone","mixed","unattributed"],"iron":["unattributed","mixed","wood","stone"]}';
BEGIN
  IF p_command IS NULL OR length(p_command) < 8 THEN RETURN jsonb_build_object('ok',false,'error','Chybí command_id'); END IF;
  IF coalesce(p_gold,-1) < 0 OR coalesce(p_wood,-1) < 0 OR coalesce(p_stone,-1) < 0 OR coalesce(p_iron,-1) < 0 THEN
    RETURN jsonb_build_object('ok',false,'error','Neplatná cena'); END IF;
  SELECT * INTO prior FROM construction_allocations WHERE session_id=p_session AND command_id=p_command;
  IF FOUND THEN
    IF prior.player_name <> p_player OR prior.city_id <> p_city THEN
      RETURN jsonb_build_object('ok',false,'error','command_id patří jiné stavbě'); END IF;
    RETURN jsonb_build_object('ok',prior.status<>'released','idempotent',true,'allocation_id',prior.id,'draws',prior.draws,'status',prior.status);
  END IF;
  SELECT current_turn INTO cur FROM game_sessions WHERE id=p_session;
  IF cur IS NULL OR cur <> p_turn THEN RETURN jsonb_build_object('ok',false,'error','Tah se mezitím změnil'); END IF;
  IF NOT EXISTS (SELECT 1 FROM cities WHERE id=p_city AND session_id=p_session AND owner_player=p_player) THEN
    RETURN jsonb_build_object('ok',false,'error','Stavět lze jen ve vlastním městě'); END IF;
  SELECT id, gold_reserve, production_reserve, construction_reserve_composition INTO rr
    FROM realm_resources WHERE session_id=p_session AND player_name=p_player FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','Realm not found'); END IF;
  total := p_wood + p_stone + p_iron;
  IF coalesce(rr.gold_reserve,0) + 0.000001 < ceil(p_gold) THEN
    RETURN jsonb_build_object('ok',false,'error',format('Nedostatek zlata (potřeba %s, máš %s)',ceil(p_gold),floor(coalesce(rr.gold_reserve,0)))); END IF;
  IF coalesce(rr.production_reserve,0) + 0.000001 < total THEN
    RETURN jsonb_build_object('ok',false,'error',format('Nedostatek stavebních materiálů (potřeba %s, máš %s)',total,floor(coalesce(rr.production_reserve,0)))); END IF;
  comp := construction_composition_normalize(rr.construction_reserve_composition, rr.production_reserve);
  left_ := comp;
  FOREACH mat IN ARRAY ARRAY['wood','stone','iron'] LOOP
    need := CASE mat WHEN 'wood' THEN p_wood WHEN 'stone' THEN p_stone ELSE p_iron END;
    md := '{}'::jsonb;
    FOR b IN SELECT jsonb_array_elements_text(orders->mat) LOOP
      EXIT WHEN need <= 0.000001;
      avail := (left_->>b)::numeric;
      take := LEAST(need, avail);
      IF take > 0.000001 THEN
        md := md || jsonb_build_object(b, round(take,6));
        left_ := left_ || jsonb_build_object(b, round(avail - take,6));
        need := need - take;
      END IF;
    END LOOP;
    IF need > 0.000001 THEN
      RETURN jsonb_build_object('ok',false,'error',format('Chybí %s (%s jednotek) ve stavební zásobě',
        CASE mat WHEN 'wood' THEN 'dřevo' WHEN 'stone' THEN 'kámen' ELSE 'železo/body' END, ceil(need)),'shortage',mat);
    END IF;
    draws := draws || jsonb_build_object(mat, md);
  END LOOP;
  UPDATE realm_resources SET gold_reserve = gold_reserve - ceil(p_gold),
    production_reserve = GREATEST(0, production_reserve - total),
    construction_reserve_composition = construction_composition_normalize(left_, GREATEST(0, production_reserve - total))
    WHERE id = rr.id;
  INSERT INTO construction_allocations(session_id,player_name,command_id,city_id,turn_number,requirement,draws,gold_paid,production_paid)
    VALUES (p_session,p_player,p_command,p_city,p_turn,
      jsonb_build_object('wood',p_wood,'stone',p_stone,'iron',p_iron,'iron_from_pooled_points',p_iron>0),draws,ceil(p_gold),total)
    RETURNING id INTO prior.id;
  RETURN jsonb_build_object('ok',true,'allocation_id',prior.id,'draws',draws);
END $$;

-- Bind a reserved allocation to the inserted building (reserved → committed). Idempotent.
CREATE OR REPLACE FUNCTION public.commit_construction_allocation(p_session uuid, p_command text, p_building uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a construction_allocations%ROWTYPE;
BEGIN
  SELECT * INTO a FROM construction_allocations WHERE session_id=p_session AND command_id=p_command FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','allocation not found'); END IF;
  IF a.status='committed' THEN RETURN jsonb_build_object('ok', a.building_id = p_building, 'idempotent', true); END IF;
  IF a.status<>'reserved' THEN RETURN jsonb_build_object('ok',false,'error','allocation released'); END IF;
  IF NOT EXISTS (SELECT 1 FROM city_buildings WHERE id=p_building AND city_id=a.city_id) THEN
    RETURN jsonb_build_object('ok',false,'error','building mismatch'); END IF;
  UPDATE construction_allocations SET status='committed', building_id=p_building, updated_at=now() WHERE id=a.id;
  RETURN jsonb_build_object('ok',true);
END $$;

-- Release a still-reserved allocation (building insert failed): refunds exactly what was drawn,
-- back into the same material buckets. Idempotent; a committed allocation is never refunded.
CREATE OR REPLACE FUNCTION public.release_construction_allocation(p_session uuid, p_command text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a construction_allocations%ROWTYPE; rr record; comp jsonb; mat text; b text; v numeric;
BEGIN
  SELECT * INTO a FROM construction_allocations WHERE session_id=p_session AND command_id=p_command FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','allocation not found'); END IF;
  IF a.status='released' THEN RETURN jsonb_build_object('ok',true,'idempotent',true); END IF;
  IF a.status<>'reserved' THEN RETURN jsonb_build_object('ok',false,'error','allocation already committed'); END IF;
  SELECT id, production_reserve, construction_reserve_composition INTO rr FROM realm_resources
    WHERE session_id=a.session_id AND player_name=a.player_name FOR UPDATE;
  comp := construction_composition_normalize(rr.construction_reserve_composition, rr.production_reserve);
  FOR mat IN SELECT jsonb_object_keys(a.draws) LOOP
    FOR b, v IN SELECT key, value::numeric FROM jsonb_each_text(a.draws->mat) LOOP
      comp := comp || jsonb_build_object(b, (comp->>b)::numeric + v);
    END LOOP;
  END LOOP;
  UPDATE realm_resources SET gold_reserve = gold_reserve + a.gold_paid,
    production_reserve = production_reserve + a.production_paid,
    construction_reserve_composition = construction_composition_normalize(comp, production_reserve + a.production_paid)
    WHERE id = rr.id;
  UPDATE construction_allocations SET status='released', updated_at=now() WHERE id=a.id;
  RETURN jsonb_build_object('ok',true);
END $$;

REVOKE ALL ON FUNCTION public.allocate_construction_reserve(uuid,text,text,uuid,integer,numeric,numeric,numeric,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_construction_allocation(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_construction_allocation(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_construction_reserve(uuid,text,text,uuid,integer,numeric,numeric,numeric,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_construction_allocation(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_construction_allocation(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.construction_composition_normalize(jsonb,numeric) TO service_role, authenticated;
