-- Make autonomous decisions opt-in per city, nonfatal to canonical turn settlement.
-- Any policy crash is logged as a SQL warning; player economy and turn are never held hostage.
CREATE OR REPLACE FUNCTION public.plan_neutral_city_at_turn_begin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
BEGIN
  IF NEW.resolving_turn IS NOT NULL
     AND OLD.resolving_turn IS DISTINCT FROM NEW.resolving_turn
     AND NEW.resolving_turn=NEW.current_turn+1
     AND EXISTS(SELECT 1 FROM public.cities c WHERE c.session_id=NEW.id
      AND c.owner_player LIKE 'Neutral:%' AND c.status='ok')
  THEN
    BEGIN
      PERFORM public.plan_neutral_city_production(NEW.id,NEW.current_turn);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Neutral production planning skipped for turn %: %',NEW.current_turn,SQLERRM;
    END;
    BEGIN
      PERFORM public.plan_neutral_city_investments(NEW.id,NEW.current_turn);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Neutral investment planning skipped for turn %: %',NEW.current_turn,SQLERRM;
    END;
  END IF;
  RETURN NEW;
END
$f$;
