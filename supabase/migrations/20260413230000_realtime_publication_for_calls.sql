-- Add the `calls` table to the Supabase Realtime publication so the Call
-- History UI updates live as the VAPI webhook transitions status
-- (scheduled -> ringing -> in-progress -> completed) and writes transcript
-- + summary at end-of-call. Idempotent.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END
$$;
