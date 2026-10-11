import { AuthError, bearer, isAdminUser } from "../_shared/sessionAuth.ts";

interface Db {
  auth: { getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  // deno-lint-ignore no-explicit-any -- untyped Supabase query builder boundary
  from(table: string): any;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SnapshotRequest { sessionId: string; turn: number | null }

export function parseRequest(body: unknown): SnapshotRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.sessionId !== "string" || !UUID.test(b.sessionId)) return null;
  const turn = b.turn == null ? null : Number(b.turn);
  if (turn != null && (!Number.isInteger(turn) || turn < 0 || turn > 100000)) return null;
  return { sessionId: b.sessionId, turn };
}

/** JWT required (401); admin role required (403). Never accepts the service key from browsers' perspective — only verified users. */
export async function authorizeAdmin(req: Request, db: Db): Promise<string> {
  const token = bearer(req);
  if (!token) throw new AuthError("Authentication required", 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new AuthError("Invalid or expired session", 401);
  if (!(await isAdminUser(db, data.user.id))) throw new AuthError("Admin role required", 403);
  return data.user.id;
}
