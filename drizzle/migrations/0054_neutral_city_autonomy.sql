-- Deterministic neutral city production decisions. No AI provider, no fiscal mutations.
-- The only live effect is a canonical structure_production_orders selection (read by economyAdapter).
-- Reads ONLY previously committed economic facts, never the provisional current turn.
CREATE TABLE IF NOT EXISTS public.neutral_city_decisions (
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL CHECK (turn_number > 0),
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  structure_id uuid NOT NULL REFERENCES public.city_buildings(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('prefer','auto')),
  recipe_key text NULL,
  target_good_key text NULL,
  reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,turn_number,structure_id)
);
CREATE INDEX IF NOT EXISTS neutral_city_decisions_city_idx
  ON public.neutral_city_decisions (session_id,city_id,turn_number DESC);
REVOKE ALL ON public.neutral_city_decisions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.neutral_city_decisions TO service_role;

CREATE OR REPLACE FUNCTION public.plan_neutral_city_production(p_session uuid,p_turn integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $autonomy$
DECLARE
  v_session public.game_sessions%ROWTYPE;
  b record; r record;
  v_source_key text; v_source_good text; v_source_pos record;
  v_known_good text[];
  v_recipe_keys text[];
  v_tags text[];
  v_best_key text; v_best_good text; v_best_score numeric; v_score numeric;
  v_input jsonb; v_input_key text; v_input_score numeric;
  v_essential text; v_shortage numeric; v_stock numeric;
  v_price numeric; v_any boolean; v_reason jsonb;
  v_changed integer := 0; v_reused integer := 0;
  v_output jsonb;
BEGIN
  IF p_session IS NULL OR p_turn IS NULL OR p_turn < 1 THEN
    RAISE EXCEPTION 'Invalid neutral autonomy inputs';
  END IF;
  SELECT * INTO v_session FROM public.game_sessions WHERE id=p_session FOR UPDATE;
  IF NOT FOUND OR v_session.current_turn <> p_turn
    OR (v_session.resolving_turn IS NOT NULL AND v_session.resolving_turn <> p_turn+1)
  THEN RAISE EXCEPTION 'Neutral autonomy: stale session or turn'; END IF;

  -- The source of truth for ownership is cities.owner_player, not a user-controlled string.
  -- No game_player rows are added: neutral cities are not human turns or LLM-run AI factions.
  FOR b IN
    SELECT cb.id AS building_id,cb.city_id,cb.name AS building_name,cb.effects,
           c.owner_player,c.name AS city_name,
           coalesce(cb.effects->'recipe_keys',bt.effects->'recipe_keys','[]'::jsonb) AS base_keys,
           coalesce(cb.effects->'specialization_recipe_keys',bt.effects->'specialization_recipe_keys','[]'::jsonb) AS spec_keys,
           coalesce(cb.effects->'capability_tags',bt.effects->'capability_tags','[]'::jsonb) AS tags
      FROM public.city_buildings cb
      JOIN public.cities c ON c.id=cb.city_id AND c.session_id=cb.session_id
      LEFT JOIN public.building_templates bt ON bt.id=cb.template_id
      LEFT JOIN public.tile_parcels tp ON tp.id=cb.parcel_id AND tp.session_id=cb.session_id
     WHERE cb.session_id=p_session
       AND c.owner_player LIKE 'Neutral:%'
       AND c.status='ok'
       AND cb.status='completed'
       AND cb.parcel_id IS NOT NULL
       AND coalesce(tp.claim_kind,'urban') <> 'worked'
     ORDER BY c.name,cb.id
  LOOP
    IF EXISTS(SELECT 1 FROM public.neutral_city_decisions d
      WHERE d.session_id=p_session AND d.turn_number=p_turn AND d.structure_id=b.building_id)
    THEN
      v_reused:=v_reused+1; CONTINUE;
    END IF;

    -- A city can specialize its sole worked resource site. Its choice is deterministic
    -- from the map's food_specializations, not inferred from its display name.
    v_source_key:=NULL;v_source_good:=NULL;
    SELECT fs.resource_key,har.output_good_key INTO v_source_key,v_source_good
      FROM public.food_specializations fs
      JOIN public.tile_parcels tp ON tp.id=fs.site_parcel_id AND tp.session_id=fs.session_id
      JOIN public.production_recipes har ON har.recipe_key='harvest_food_'||fs.resource_key
     WHERE fs.session_id=p_session AND tp.city_id=b.city_id AND tp.claim_kind='worked'
     ORDER BY fs.resource_key LIMIT 1;

    v_recipe_keys:=ARRAY(
      SELECT DISTINCT k FROM (
        SELECT jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(b.base_keys)='array' THEN b.base_keys ELSE '[]'::jsonb END
        ) AS k
        UNION ALL
        SELECT jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(b.spec_keys)='array' THEN b.spec_keys ELSE '[]'::jsonb END
        ) AS k
      ) t
    );
    v_tags:=ARRAY(SELECT jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(b.tags)='array' THEN b.tags ELSE '[]'::jsonb END));
    v_known_good:=ARRAY(
      -- A single physical source + city-owned production capabilities: max two stages,
      -- avoids assuming infinite inventory of every locally craftable product.
      WITH roots AS (
        SELECT v_source_good AS good
        UNION
        SELECT p.output_good_key AS good
        FROM public.production_recipes p
        WHERE p.recipe_key IN ('milk_cattle','milk_goats','collect_eggs')
          AND p.recipe_key = CASE v_source_key WHEN 'cattle' THEN 'milk_cattle'
            WHEN 'goats' THEN 'milk_goats' WHEN 'chickens' THEN 'collect_eggs' ELSE '' END
      ), first_stage AS (
        SELECT DISTINCT p.output_good_key AS good
          FROM public.city_buildings cb
          JOIN public.building_templates bt ON bt.id=cb.template_id
          CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(coalesce(cb.effects->'specialization_recipe_keys',bt.effects->'specialization_recipe_keys'))='array'
            THEN coalesce(cb.effects->'specialization_recipe_keys',bt.effects->'specialization_recipe_keys') ELSE '[]'::jsonb END
          ) keyname
          JOIN public.production_recipes p ON p.recipe_key=keyname.value
         WHERE cb.city_id=b.city_id AND cb.session_id=p_session AND cb.status='completed'
           AND p.required_role <> 'source'
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p.input_items,'[]'::jsonb)) i
             WHERE i->>'key' IN (SELECT good FROM roots WHERE good IS NOT NULL)
             AND coalesce(i->>'kind','material')='material')
      )
      SELECT good FROM (SELECT good FROM roots UNION SELECT good FROM first_stage) g WHERE good IS NOT NULL
    );

    v_best_score:=-1;v_best_key:=NULL;v_best_good:=NULL;v_any:=false;
    FOR r IN
      SELECT pr.*,g.demand_basket,g.base_price_numeric
        FROM public.production_recipes pr
        JOIN public.goods g ON g.key=pr.output_good_key
       WHERE pr.recipe_key=ANY(v_recipe_keys)
         AND pr.required_role <> 'source'
         AND coalesce(pr.required_tags,ARRAY[]::text[]) <@ v_tags
       ORDER BY pr.recipe_key
    LOOP
      v_any:=true;v_input_score:=0;
      FOR v_input IN SELECT value FROM jsonb_array_elements(coalesce(r.input_items,'[]'::jsonb)) LOOP
        IF coalesce(v_input->>'kind','material') IN ('operating','factor') THEN CONTINUE; END IF;
        v_input_key:=v_input->>'key';
        IF v_input_key=v_source_good THEN
          v_input_score:=v_input_score+130; -- local primary harvest
        ELSIF v_input_key=ANY(coalesce(v_known_good,ARRAY[]::text[])) THEN
          v_input_score:=v_input_score+100; -- reachable local downstream input / by-product
        ELSE
          SELECT coalesce((cb.balance->>'stored')::numeric,0) INTO v_stock
          FROM public.city_good_balances cb JOIN public.economy_turn_ledgers e
            ON e.session_id=cb.session_id AND e.turn_number=cb.turn_number AND e.committed=true
          WHERE cb.session_id=p_session AND cb.city_id=b.city_id AND cb.good_key=v_input_key
            AND cb.turn_number<p_turn
          ORDER BY cb.turn_number DESC LIMIT 1;
          IF coalesce(v_stock,0)>0 THEN v_input_score:=v_input_score+50;END IF;
        END IF;
      END LOOP;
      -- An unsupported recipe must not win just because its output is expensive.
      -- No-input recipes are legal, but every specialized city processor should
      -- choose the recipe whose input can actually come from this city.
      IF v_input_score<=0 THEN CONTINUE; END IF;

      SELECT coalesce(max(cb.unmet_demand / greatest(cb.local_demand,1)),0)
        INTO v_shortage FROM public.city_market_baskets cb
       WHERE cb.session_id=p_session AND cb.city_id=b.city_id
         AND cb.turn_number=(SELECT max(e.turn_number) FROM public.economy_turn_ledgers e
           WHERE e.session_id=p_session AND e.committed AND e.turn_number<p_turn)
         AND cb.basket_key=r.demand_basket;
      v_price:=greatest(0,coalesce(r.base_price_numeric,0));
      -- Priority: demonstrated input, essential shortage, then lagged market value.
      -- Tie-breaking is stable by recipe_key (ordered loop).
      v_score:=v_input_score
        + CASE WHEN r.demand_basket='staple_food' THEN 18
               WHEN r.demand_basket='drinking_water' THEN 20
               WHEN r.demand_basket='fuel' THEN 12 ELSE 0 END
        + least(100,coalesce(v_shortage,0)*50)
        + least(20,v_price*3);
      IF v_score>v_best_score THEN
        v_best_score:=v_score;v_best_key:=r.recipe_key;v_best_good:=r.output_good_key;
      END IF;
    END LOOP;
    IF NOT v_any THEN CONTINUE; END IF;

    v_reason:=jsonb_build_object('source',v_source_key,'source_good',v_source_good,
       'reachable_inputs',to_jsonb(coalesce(v_known_good,ARRAY[]::text[])),
       'target_recipe',v_best_key,'score',greatest(0,v_best_score),
       'basis','committed_ledger_or_catalogue','no_cash_change',true);
    -- This is the SAME structure order interpreted by computeCanonicalEconomy.
    -- Never overwrite a human city's order; only Neutral: city ownership is eligible.
    INSERT INTO public.structure_production_orders(session_id,structure_id,structure_type,mode,
      target_good_key,target_basket_key)
    VALUES(p_session,b.building_id,'building',
       CASE WHEN v_best_key IS NULL THEN 'auto' ELSE 'prefer' END,v_best_good,NULL)
    ON CONFLICT (session_id,structure_id) DO UPDATE
      SET mode=excluded.mode,target_good_key=excluded.target_good_key,
          target_basket_key=NULL,updated_at=now();
    INSERT INTO public.neutral_city_decisions(session_id,turn_number,city_id,structure_id,
      decision,recipe_key,target_good_key,reason)
    VALUES(p_session,p_turn,b.city_id,b.building_id,
       CASE WHEN v_best_key IS NULL THEN 'auto' ELSE 'prefer' END,v_best_key,v_best_good,v_reason);
    v_changed:=v_changed+1;
  END LOOP;
  SELECT jsonb_build_object('ok',true,'session',p_session,'turn',p_turn,
    'decisions_written',v_changed,'already_decided',v_reused,
    'owner_filter','Neutral:%','fiscal_writer',false)
    INTO v_output;
  RETURN v_output;
END
$autonomy$;

REVOKE ALL ON FUNCTION public.plan_neutral_city_production(uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.plan_neutral_city_production(uuid,integer) TO service_role;
