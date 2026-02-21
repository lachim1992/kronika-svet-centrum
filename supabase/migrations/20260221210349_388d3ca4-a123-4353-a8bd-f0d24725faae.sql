
-- Backfill encyclopedia_images from legacy tables (skip null entity_ids)

-- 1) regions -> cover
INSERT INTO encyclopedia_images (session_id, entity_type, entity_id, kind, style_preset, image_url, image_prompt, is_primary, created_by)
SELECT r.session_id, 'region', r.id, 'cover', 'default', r.image_url, r.image_prompt, true, 'migration'
FROM regions r
WHERE r.image_url IS NOT NULL AND r.image_url != ''
AND NOT EXISTS (
  SELECT 1 FROM encyclopedia_images ei WHERE ei.session_id = r.session_id AND ei.entity_type = 'region' AND ei.entity_id = r.id AND ei.kind = 'cover' AND ei.is_primary = true
);

-- 2) provinces -> cover
INSERT INTO encyclopedia_images (session_id, entity_type, entity_id, kind, style_preset, image_url, image_prompt, is_primary, created_by)
SELECT p.session_id, 'province', p.id, 'cover', 'default', p.image_url, p.image_prompt, true, 'migration'
FROM provinces p
WHERE p.image_url IS NOT NULL AND p.image_url != ''
AND NOT EXISTS (
  SELECT 1 FROM encyclopedia_images ei WHERE ei.session_id = p.session_id AND ei.entity_type = 'province' AND ei.entity_id = p.id AND ei.kind = 'cover' AND ei.is_primary = true
);

-- 3) wonders -> cover
INSERT INTO encyclopedia_images (session_id, entity_type, entity_id, kind, style_preset, image_url, image_prompt, is_primary, created_by)
SELECT w.session_id, 'wonder', w.id, 'cover', 'default', w.image_url, w.image_prompt, true, 'migration'
FROM wonders w
WHERE w.image_url IS NOT NULL AND w.image_url != ''
AND NOT EXISTS (
  SELECT 1 FROM encyclopedia_images ei WHERE ei.session_id = w.session_id AND ei.entity_type = 'wonder' AND ei.entity_id = w.id AND ei.kind = 'cover' AND ei.is_primary = true
);

-- 4) great_persons -> cover
INSERT INTO encyclopedia_images (session_id, entity_type, entity_id, kind, style_preset, image_url, image_prompt, is_primary, created_by)
SELECT gp.session_id, 'person', gp.id, 'cover', 'default', gp.image_url, gp.image_prompt, true, 'migration'
FROM great_persons gp
WHERE gp.image_url IS NOT NULL AND gp.image_url != ''
AND NOT EXISTS (
  SELECT 1 FROM encyclopedia_images ei WHERE ei.session_id = gp.session_id AND ei.entity_type = 'person' AND ei.entity_id = gp.id AND ei.kind = 'cover' AND ei.is_primary = true
);

-- 5) countries -> cover
INSERT INTO encyclopedia_images (session_id, entity_type, entity_id, kind, style_preset, image_url, image_prompt, is_primary, created_by)
SELECT c.session_id, 'country', c.id, 'cover', 'default', c.image_url, c.image_prompt, true, 'migration'
FROM countries c
WHERE c.image_url IS NOT NULL AND c.image_url != ''
AND NOT EXISTS (
  SELECT 1 FROM encyclopedia_images ei WHERE ei.session_id = c.session_id AND ei.entity_type = 'country' AND ei.entity_id = c.id AND ei.kind = 'cover' AND ei.is_primary = true
);

-- 6) wiki_entries -> card (only where entity_id is NOT NULL)
INSERT INTO encyclopedia_images (session_id, entity_type, entity_id, kind, style_preset, image_url, image_prompt, is_primary, created_by)
SELECT w.session_id, w.entity_type, w.entity_id, 'card', 'medieval_illumination', w.image_url, w.image_prompt, false, 'migration'
FROM wiki_entries w
WHERE w.image_url IS NOT NULL AND w.image_url != '' AND w.entity_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM encyclopedia_images ei WHERE ei.session_id = w.session_id AND ei.entity_type = w.entity_type AND ei.entity_id = w.entity_id AND ei.image_url = w.image_url
);

-- 7) wonder_draft_images -> illustration
INSERT INTO encyclopedia_images (session_id, entity_type, entity_id, kind, style_preset, image_url, image_prompt, is_primary, created_by)
SELECT w.session_id, 'wonder', wdi.wonder_id, 'illustration', 'default', wdi.image_url, wdi.image_prompt, false, 'migration'
FROM wonder_draft_images wdi
JOIN wonders w ON w.id = wdi.wonder_id
WHERE wdi.image_url IS NOT NULL AND wdi.image_url != ''
AND NOT EXISTS (
  SELECT 1 FROM encyclopedia_images ei WHERE ei.session_id = w.session_id AND ei.entity_type = 'wonder' AND ei.entity_id = wdi.wonder_id AND ei.image_url = wdi.image_url
);
