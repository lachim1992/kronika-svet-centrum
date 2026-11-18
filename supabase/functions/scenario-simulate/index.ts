// Authenticated, stateless sandbox simulations. No session lookup, table access or writes.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { bearer } from "../_shared/sessionAuth.ts";
import { simulateBattle, simulateExtraction } from "./simulate.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  try {
    const token = bearer(req);
    if (!token) return json({ ok: false, error: "Authentication required" }, 401);
    const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user) return json({ ok: false, error: "Invalid or expired session" }, 401);
    const body = await req.json().catch(() => null) as { kind?: string; scenario?: unknown; attackerId?: string } | null;
    if (!body?.scenario) return json({ ok: false, error: "Chybí scénář" });
    if (body.kind === "battle") return json({ ok: true, result: simulateBattle(body.scenario, String(body.attackerId ?? "")) });
    if (body.kind === "extraction") return json({ ok: true, result: simulateExtraction(body.scenario) });
    return json({ ok: false, error: "Neznámý typ simulace" });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Simulace selhala" });
  }
});
