-- Remove anonymous mutation access while preserving public reads and all existing authenticated gameplay.
DO $$
DECLARE
  p record;
  select_policy_name text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'public' = ANY(roles)
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  LOOP
    IF p.cmd = 'ALL' THEN
      select_policy_name := left('public_read_' || p.tablename, 63);
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies existing
        WHERE existing.schemaname = p.schemaname
          AND existing.tablename = p.tablename
          AND existing.policyname = select_policy_name
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON %I.%I FOR SELECT TO public USING (true)',
          select_policy_name, p.schemaname, p.tablename
        );
      END IF;
    END IF;

    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO authenticated',
      p.policyname, p.schemaname, p.tablename
    );
  END LOOP;
END
$$;

-- Diplomacy is private to the two room participants.
DROP POLICY IF EXISTS "Public access to diplomacy messages" ON public.diplomacy_messages;
DROP POLICY IF EXISTS "Public access to diplomacy rooms" ON public.diplomacy_rooms;
DROP POLICY IF EXISTS public_read_diplomacy_messages ON public.diplomacy_messages;
DROP POLICY IF EXISTS public_read_diplomacy_rooms ON public.diplomacy_rooms;

CREATE POLICY diplomacy_rooms_participant_read
ON public.diplomacy_rooms
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.game_players gp
    WHERE gp.session_id = diplomacy_rooms.session_id
      AND gp.user_id = auth.uid()
      AND gp.player_name IN (diplomacy_rooms.participant_a, diplomacy_rooms.participant_b)
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY diplomacy_rooms_participant_create
ON public.diplomacy_rooms
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.game_players gp
    WHERE gp.session_id = diplomacy_rooms.session_id
      AND gp.user_id = auth.uid()
      AND gp.player_name IN (diplomacy_rooms.participant_a, diplomacy_rooms.participant_b)
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY diplomacy_messages_participant_read
ON public.diplomacy_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.diplomacy_rooms room
    JOIN public.game_players gp ON gp.session_id = room.session_id
    WHERE room.id = diplomacy_messages.room_id
      AND gp.user_id = auth.uid()
      AND gp.player_name IN (room.participant_a, room.participant_b)
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY diplomacy_messages_participant_create
ON public.diplomacy_messages
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.diplomacy_rooms room
    JOIN public.game_players gp ON gp.session_id = room.session_id
    WHERE room.id = diplomacy_messages.room_id
      AND gp.user_id = auth.uid()
      AND gp.player_name = diplomacy_messages.sender
      AND gp.player_name IN (room.participant_a, room.participant_b)
  )
  OR public.has_role(auth.uid(), 'admin')
);

-- Keep public image viewing, but prevent anonymous overwrite or deletion.
DROP POLICY IF EXISTS "Anyone can upload wonder images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update wonder images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete wonder images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload wonder images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own wonder images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own wonder images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own building images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own building images" ON storage.objects;

CREATE POLICY "Authenticated users can upload wonder images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'wonder-images');

CREATE POLICY "Users can update their own wonder images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'wonder-images' AND owner_id = auth.uid()::text)
WITH CHECK (bucket_id = 'wonder-images' AND owner_id = auth.uid()::text);

CREATE POLICY "Users can delete their own wonder images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'wonder-images' AND owner_id = auth.uid()::text);

CREATE POLICY "Users can update their own building images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'building-images' AND owner_id = auth.uid()::text)
WITH CHECK (bucket_id = 'building-images' AND owner_id = auth.uid()::text);

CREATE POLICY "Users can delete their own building images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'building-images' AND owner_id = auth.uid()::text);