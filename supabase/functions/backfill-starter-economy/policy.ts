import { AuthError, authorizeSessionCaller, type SessionCaller } from "../_shared/sessionAuth.ts";

/** Save upgrades (including dry-run reports of other players' cities) are admin/internal only. */
export function requireBackfillAdmin(caller: SessionCaller): SessionCaller {
  if (!caller.service && !caller.admin) throw new AuthError("Admin role required", 403);
  return caller;
}

// deno-lint-ignore no-explicit-any
export async function authorizeBackfill(req: Request, db: any, sessionId: string): Promise<SessionCaller> {
  return requireBackfillAdmin(await authorizeSessionCaller(req, db, sessionId));
}
