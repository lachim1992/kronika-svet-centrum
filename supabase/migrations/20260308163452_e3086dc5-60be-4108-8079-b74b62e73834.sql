
-- Fix law 1: "Zastavení hladomoru" - resource→grain, stability stays
UPDATE laws SET structured_effects = '[{"type":"grain","label":"Obilí (nákup)","value":50},{"type":"stability","label":"Stabilita","value":10}]'::jsonb
WHERE id = '021824f5-08b3-48f5-8c97-e6b8f01cedfb';

-- Fix law 2: "Obranná garda" - resource→iron, manpower stays
UPDATE laws SET structured_effects = '[{"type":"manpower","label":"Muži","value":-500},{"type":"iron","label":"Železo","value":-50}]'::jsonb
WHERE id = '41be731c-fb96-415a-a864-2603051a409f';

-- Apply immediate effects to realm_resources:
-- grain +50 (was 0), iron -50 (was 99→49), manpower -500 (was 2006→1506), stability +10 (was 70→80)
UPDATE realm_resources SET
  grain_reserve = GREATEST(0, grain_reserve + 50),
  iron_reserve = GREATEST(0, iron_reserve - 50),
  manpower_pool = GREATEST(0, manpower_pool - 500),
  stability = LEAST(100, stability + 10)
WHERE session_id = 'b0b66f4e-be21-428c-9488-7a245adada25' AND player_name = 'JAMAP';

-- Apply stability +10 to capital/main city Jamapol
UPDATE cities SET city_stability = LEAST(100, city_stability + 10)
WHERE id = '5bd5d282-6fd7-4ad8-aef6-6e84109cf83f';

-- Fix declaration effects to use proper types too
UPDATE declarations SET effects = '[{"type":"grain","label":"Obilí (nákup)","value":50},{"type":"stability","label":"Stabilita Jamapol","value":10}]'::jsonb
WHERE id = '706bad5c-0279-4e85-b93b-27aa29778bad';

UPDATE declarations SET effects = '[{"type":"manpower","label":"Muži","value":-500},{"type":"iron","label":"Železo","value":-50}]'::jsonb
WHERE id = '55070524-ac33-423d-a297-2867c417030f';
