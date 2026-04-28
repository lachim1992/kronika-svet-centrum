UPDATE public.world_node_outputs
SET basket_key = CASE basket_key
  WHEN 'faith' THEN 'admin_supplies'
  WHEN 'drink' THEN 'feast'
  WHEN 'luxury' THEN 'luxury_clothing'
  ELSE basket_key
END
WHERE basket_key IN ('faith','drink','luxury');