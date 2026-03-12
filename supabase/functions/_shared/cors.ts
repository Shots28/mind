const APP_URL = Deno.env.get("APP_URL") || "*";

if (APP_URL === "*") {
  console.warn("WARNING: APP_URL is not set. CORS is allowing all origins. Set APP_URL in production.");
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": APP_URL,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
