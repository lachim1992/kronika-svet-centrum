UPDATE realm_resources
SET last_turn_grain_cons = ABS(last_turn_grain_cons)
WHERE last_turn_grain_cons < 0;