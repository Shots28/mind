-- Add tables the UI subscribes to for Realtime UI updates (VAPI voice
-- agent writes externally, and the UI should reflect those writes without
-- a manual reload). Idempotent: DO block catches duplicate_object so
-- re-running on an already-published table is a no-op.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['tasks', 'habits', 'habit_logs', 'journal_entries', 'events']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END
$$;
