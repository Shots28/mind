// Vercel CRON handler — triggers the Supabase ai-retry-calls edge function every 15 minutes
export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');

  if (cronSecret) {
    if (req.headers['authorization'] !== `Bearer ${cronSecret}`) {
      console.warn('[cron-retry-calls] Unauthorized: bad CRON_SECRET');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (!isVercelCron) {
    console.warn('[cron-retry-calls] No CRON_SECRET set and not a Vercel cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSharedSecret = process.env.CRON_SHARED_SECRET;

  if (!supabaseUrl || (!serviceRoleKey && !cronSharedSecret)) {
    console.error('[cron-retry-calls] Missing env vars', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      hasCronSharedSecret: !!cronSharedSecret,
    });
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const gatewayToken = serviceRoleKey || anonKey;

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/ai-retry-calls`, {
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
    console.log('[cron-retry-calls] result:', resp.status, data);
    return res.status(resp.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('[cron-retry-calls] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
