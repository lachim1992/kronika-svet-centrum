
-- Add demobilized_turn to military_stacks for tracking demobilization state
ALTER TABLE public.military_stacks ADD COLUMN demobilized_turn integer DEFAULT NULL;

-- Add remobilize_ready_turn to track when a demobilized unit can be reactivated  
ALTER TABLE public.military_stacks ADD COLUMN remobilize_ready_turn integer DEFAULT NULL;
