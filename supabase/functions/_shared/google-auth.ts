import { getSupabaseAdmin } from "./supabase-admin.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

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

  // Try to acquire refresh lock (mutex)
  const { data: locked, error: lockErr } = await admin
    .from("google_connections")
    .update({ token_refresh_lock: new Date().toISOString() })
    .eq("id", connectionId)
    .or(
      "token_refresh_lock.is.null,token_refresh_lock.lt." +
        new Date(Date.now() - 30_000).toISOString(),
    )
    .select("id")
    .maybeSingle();

  if (lockErr || !locked) {
    // Another function is refreshing -- wait briefly and re-read
    await new Promise((r) => setTimeout(r, 2000));
    const { data: refreshed } = await admin
      .from("google_connections")
      .select("access_token")
      .eq("id", connectionId)
      .single();
    if (refreshed) return refreshed.access_token;
    throw new Error("Failed to get refreshed token");
  }

  // We have the lock -- refresh the token
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
          .update({
            is_active: false,
            token_refresh_lock: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", connectionId);
      }
      throw new Error(`Token refresh failed: ${tokens.error}`);
    }

    // Store new tokens
    await admin
      .from("google_connections")
      .update({
        access_token: tokens.access_token,
        token_expires_at: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
        token_refresh_lock: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);

    return tokens.access_token;
  } catch (err) {
    // Release lock on error
    await admin
      .from("google_connections")
      .update({ token_refresh_lock: null })
      .eq("id", connectionId);
    throw err;
  }
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
}
