import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nonce = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const appUrl = Deno.env.get("APP_URL")!;

  // User denied consent
  if (errorParam) {
    return Response.redirect(
      `${appUrl}/settings?google_error=${encodeURIComponent(errorParam)}`,
      302,
    );
  }

  if (!code || !nonce) {
    return Response.redirect(
      `${appUrl}/settings?google_error=missing_params`,
      302,
    );
  }

  const admin = getSupabaseAdmin();

  // Verify nonce against oauth_states (CSRF protection)
  const { data: stateRow, error: stateErr } = await admin
    .from("oauth_states")
    .select("user_id, expires_at")
    .eq("nonce", nonce)
    .maybeSingle();

  if (stateErr || !stateRow) {
    return Response.redirect(
      `${appUrl}/settings?google_error=invalid_state`,
      302,
    );
  }

  // Check expiry
  if (new Date(stateRow.expires_at) < new Date()) {
    await admin.from("oauth_states").delete().eq("nonce", nonce);
    return Response.redirect(
      `${appUrl}/settings?google_error=state_expired`,
      302,
    );
  }

  // Delete state (single-use)
  await admin.from("oauth_states").delete().eq("nonce", nonce);

  const userId = stateRow.user_id;

  // Exchange authorization code for tokens
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      redirect_uri: Deno.env.get("GOOGLE_REDIRECT_URI")!,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenResponse.json();
  if (tokens.error) {
    return Response.redirect(
      `${appUrl}/settings?google_error=exchange_failed`,
      302,
    );
  }

  // Get Google user info
  const userInfoRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  );
  const userInfo = await userInfoRes.json();

  if (!userInfo.email) {
    return Response.redirect(
      `${appUrl}/settings?google_error=no_email`,
      302,
    );
  }

  // Upsert connection (handles reconnection of same Google account)
  const { error: upsertError } = await admin
    .from("google_connections")
    .upsert(
      {
        user_id: userId,
        google_email: userInfo.email,
        google_user_id: userInfo.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
        scopes: tokens.scope ? tokens.scope.split(" ") : [],
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,google_user_id" },
    );

  if (upsertError) {
    console.error("Upsert error:", upsertError);
    return Response.redirect(
      `${appUrl}/today?google_error=db_error`,
      302,
    );
  }

  return Response.redirect(
    `${appUrl}/today?google_connected=true`,
    302,
  );
});
