ALTER TABLE public.field_battles ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.military_stacks DROP CONSTRAINT IF EXISTS military_stacks_battle_formation_chk;
ALTER TABLE public.military_stacks ADD CONSTRAINT military_stacks_battle_formation_chk
  CHECK (battle_formation = ANY (ARRAY['line','shieldwall','deep','loose','wedge','square','skirmish','column']));
COMMENT ON CONSTRAINT military_stacks_battle_formation_chk ON public.military_stacks IS 'column = legacy alias of deep';

CREATE OR REPLACE FUNCTION public.settle_field_battle(p_battle uuid, p_rev integer, p_patch jsonb, p_stacks jsonb, p_comps jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.field_battles SET units = p_patch->'units', orders = '[]'::jsonb, ready = '{}'::jsonb,
    last_report = p_patch->'last_report', meta = COALESCE(p_patch->'meta', meta), round = COALESCE((p_patch->>'round')::int, round),
    status = 'finished', finished_at = now(), rev = rev + 1
  WHERE id = p_battle AND rev = p_rev AND status <> 'finished';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.military_stacks s SET soldiers = x.soldiers, unit_count = x.unit_count, power = x.power, morale = x.morale, is_active = x.is_active
  FROM jsonb_to_recordset(p_stacks) AS x(id uuid, soldiers integer, unit_count integer, power integer, morale integer, is_active boolean)
  WHERE s.id = x.id;
  UPDATE public.military_stack_composition c SET manpower = x.manpower
  FROM jsonb_to_recordset(p_comps) AS x(id uuid, manpower integer) WHERE c.id = x.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.settle_field_battle(uuid, integer, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_field_battle(uuid, integer, jsonb, jsonb, jsonb) TO service_role;