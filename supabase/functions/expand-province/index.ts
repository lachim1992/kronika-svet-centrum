// RETIRED: this endpoint trusted a client player name and a skip_cost flag (bypassing adjacency and payment).
// Macro claims now go only through command-dispatch CLAIM_MACRO_TILE / ASSIGN_MACRO_PROVINCE (atomic SQL RPCs).
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "Tato akce byla zrušena — použijte Nárokovat makropole na mapě" }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
