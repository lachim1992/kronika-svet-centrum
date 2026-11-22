-- Service-side invocation point for neutral production decisions.
-- begin_turn_resolution alone updates resolving_turn from NULL to current_turn+1.
-- Running within that same transaction is atomic with the turn guard and needs no Edge redeploy.
-- Never executes an LLM, writes fiscal accounts, or touches a human player's production orders.
CREATE OR REPLACE FUNCTION public.plan_neutral_city_at_turn_begin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
BEGIN
  IF NEW.resolving_turn IS NOT NULL
     AND OLD.resolving_turn IS DISTINCT FROM NEW.resolving_turn
     AND NEW.resolving_turn=NEW.current_turn+1
     AND EXISTS (SELECT 1 FROM public.cities c
       WHERE c.session_id=NEW.id AND c.owner_player LIKE 'Neutral:%' AND c.status='ok')
  THEN
    PERFORM public.plan_neutral_city_production(NEW.id,NEW.current_turn);
  END IF;
  RETURN NEW;
END
$f$;
DROP TRIGGER IF EXISTS neutral_city_autonomy_on_turn_begin ON public.game_sessions;
CREATE TRIGGER neutral_city_autonomy_on_turn_begin
AFTER UPDATE OF resolving_turn ON public.game_sessions
FOR EACH ROW
WHEN (NEW.resolving_turn IS NOT NULL AND OLD.resolving_turn IS DISTINCT FROM NEW.resolving_turn)
EXECUTE FUNCTION public.plan_neutral_city_at_turn_begin();
REVOKE ALL ON FUNCTION public.plan_neutral_city_at_turn_begin() FROM PUBLIC,anon,authenticated;
