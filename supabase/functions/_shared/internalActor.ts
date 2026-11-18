/** Internal actor privileges come only from the service-role bearer, never from JSON. */
export function isTrustedInternalRequest(req: Request): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return Boolean(serviceKey && match?.[1]?.trim() === serviceKey);
}

export function isInternalActorType(type: unknown): boolean {
  return type === "system" || type === "ai_faction";
}
