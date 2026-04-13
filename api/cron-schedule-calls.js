// Vercel CRON handler — triggers the Supabase ai-schedule-calls edge function every 5 minutes
export default async function handler(req, res) {
  // Verify this is a genuine Vercel CRON invocation
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/ai-schedule-calls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await resp.json();
    console.log('Schedule calls result:', data);
    return res.status(200).json(data);
  } catch (err) {
    console.error('CRON schedule-calls error:', err);
    return res.status(500).json({ error: err.message });
  }
}
