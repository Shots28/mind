import { getSupabaseAdmin } from "./supabase-admin.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function releaseLock(
  admin: ReturnType<typeof getSupabaseAdmin>,
  connectionId: string,
) {
  admin
    .from("google_connections")
    .update({ token_refresh_lock: null })
    .eq("id", connectionId)
    .then(() => {});
}

export async function getValidAccessToken(
  connectionId: string,
): Promise<string> {
  const admin = getSupabaseAdmin();

  const { data: connection, error } = await admin
    .from("google_connections")
    .select("*")
    .eq("id", connectionId)
    .single();

  if (error || !connection) throw new Error("Connection not found");
  if (!connection.is_active) throw new Error("Connection is inactive");

  // If token expires in more than 5 minutes, return it as-is
  const expiresAt = new Date(connection.token_expires_at);
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt > fiveMinFromNow) {
    return connection.access_token;
  }

  // Try to acquire refresh lock (mutex) -- best-effort
  let hasLock = false;
  try {
    const { data: locked } = await admin
      .from("google_connections")
      .update({ token_refresh_lock: new Date().toISOString() })
      .eq("id", connectionId)
      .or(
        "token_refresh_lock.is.null,token_refresh_lock.lt." +
          new Date(Date.now() - 30_000).toISOString(),
      )
      .select("id")
      .maybeSingle();

    if (locked) {
      hasLock = true;
    } else {
      // Another function may be refreshing -- wait briefly and re-read
      await new Promise((r) => setTimeout(r, 2000));
      const { data: refreshed } = await admin
        .from("google_connections")
        .select("access_token, token_expires_at")
        .eq("id", connectionId)
        .single();
      if (refreshed) {
        const newExpiry = new Date(refreshed.token_expires_at);
        if (newExpiry > fiveMinFromNow) {
          return refreshed.access_token;
        }
      }
      // Token still expired after wait -- proceed with refresh anyway
    }
  } catch {
    // Lock mechanism failed (e.g. column missing) -- proceed without lock
  }

  // Refresh the token
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: connection.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const tokens = await response.json();

    if (tokens.error) {
      // Revoked access -- mark inactive
      if (tokens.error === "invalid_grant") {
        await admin
          .from("google_connections")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", connectionId);
      }
      if (hasLock) releaseLock(admin, connectionId);
      throw new Error(`Token refresh failed: ${tokens.error}`);
    }

    // Store new tokens
    const updateData: Record<string, unknown> = {
      access_token: tokens.access_token,
      token_expires_at: new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (hasLock) updateData.token_refresh_lock = null;

    await admin
      .from("google_connections")
      .update(updateData)
      .eq("id", connectionId);

    return tokens.access_token;
  } catch (err) {
    if (hasLock) releaseLock(admin, connectionId);
    throw err;
  }
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
}
