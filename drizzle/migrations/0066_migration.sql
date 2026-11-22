-- Both duplicate the unique key province_hexes_session_id_q_r_key (session_id, q, r).
DROP INDEX IF EXISTS public.idx_province_hexes_coords;
DROP INDEX IF EXISTS public.idx_province_hexes_session_coords;