import { refreshEconomy } from "../_shared/economy-refresh.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Best-effort guard only: different Edge Function workers can still overlap.
const inProgress = new Set<string>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let lockedSession: string | undefined;
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const { session_id } = await req.json();
    if (typeof session_id !== "string" || !session_id.trim()) throw new Error("Missing session_id");
    if (inProgress.has(session_id)) {
      return new Response(JSON.stringify({ error: "already_in_progress", session_id }), { headers, status: 409 });
    }
    inProgress.add(session_id);
    lockedSession = session_id;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const result = await refreshEconomy(session_id, async (name, body) => {
      const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      return {
        data,
        error: response.ok ? null : { message: data?.error || `HTTP ${response.status}` },
      };
    });
    return new Response(JSON.stringify(result), { headers, status: result.ok ? 200 : 207 });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), { headers, status: 400 });
  } finally {
    // The request body has already been consumed; keep the lock key explicitly.
    if (lockedSession) inProgress.delete(lockedSession);
  }
});
