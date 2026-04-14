// Vercel CRON handler — triggers the Supabase ai-schedule-calls edge function every 5 minutes
export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');

  // If CRON_SECRET is set, require it. Otherwise accept Vercel cron user-agent
  // (downstream edge function is still protected by service role key).
  if (cronSecret) {
    if (req.headers['authorization'] !== `Bearer ${cronSecret}`) {
      console.warn('[cron-schedule-calls] Unauthorized: bad CRON_SECRET');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (!isVercelCron) {
    console.warn('[cron-schedule-calls] No CRON_SECRET set and not a Vercel cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSharedSecret = process.env.CRON_SHARED_SECRET;

  if (!supabaseUrl || (!serviceRoleKey && !cronSharedSecret)) {
    console.error('[cron-schedule-calls] Missing env vars', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      hasCronSharedSecret: !!cronSharedSecret,
    });
    return res.status(500).json({ error: 'Missing env vars' });
  }

  // Supabase's gateway still enforces a Bearer token to route to the function.
  // Anon key is enough for that — the edge function itself re-auths via SRK or
  // the X-Cron-Secret header we send below.
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const gatewayToken = serviceRoleKey || anonKey;

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/ai-schedule-calls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
        'Content-Type': 'application/json',
        ...(cronSharedSecret ? { 'X-Cron-Secret': cronSharedSecret } : {}),
      },
    });

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    console.log('[cron-schedule-calls] result:', resp.status, data);
    return res.status(resp.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('[cron-schedule-calls] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
