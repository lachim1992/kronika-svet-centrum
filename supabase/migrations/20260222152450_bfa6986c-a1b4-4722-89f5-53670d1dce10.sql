
-- Assign unique spiral coordinates to cities with NULL hex coords
-- Use a CTE with row_number per session to generate unique positions
DO $$
DECLARE
  rec RECORD;
  idx INTEGER;
  ring INTEGER;
  pos INTEGER;
  dirs INTEGER[][] := ARRAY[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
  new_q INTEGER;
  new_r INTEGER;
  hex_key TEXT;
BEGIN
  FOR rec IN 
    SELECT c.id, c.session_id,
           ROW_NUMBER() OVER (PARTITION BY c.session_id ORDER BY c.created_at) as rn
    FROM cities c
    WHERE c.province_q IS NULL OR c.province_r IS NULL
  LOOP
    idx := rec.rn::integer;
    ring := (idx / 6) + 1;
    pos := (idx - 1) % 6;
    new_q := dirs[pos+1][1] * ring * 3 + idx;
    new_r := dirs[pos+1][2] * ring * 3;
    
    -- Make sure it's unique within this session
    WHILE EXISTS (
      SELECT 1 FROM cities 
      WHERE session_id = rec.session_id 
        AND province_q = new_q AND province_r = new_r
    ) LOOP
      new_q := new_q + 1;
    END LOOP;
    
    UPDATE cities SET province_q = new_q, province_r = new_r WHERE id = rec.id;
  END LOOP;
END $$;

-- Set defaults
ALTER TABLE public.cities ALTER COLUMN province_q SET DEFAULT 0;
ALTER TABLE public.cities ALTER COLUMN province_r SET DEFAULT 0;

-- Now make NOT NULL
ALTER TABLE public.cities ALTER COLUMN province_q SET NOT NULL;
ALTER TABLE public.cities ALTER COLUMN province_r SET NOT NULL;
