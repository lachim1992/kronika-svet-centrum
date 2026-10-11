// Caller authorization for session-scoped edge functions that run with the
// service-role client. Identity always comes from the verified JWT, never from
// a body-supplied player name.

export class AuthError extends Error {
  constructor(message: string, public status: 401 | 403) { super(message); }
}

export interface SessionCaller {
  service: boolean;
  userId: string | null;
  admin: boolean;
  member: boolean;
}

interface Db {
  auth: { getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from(table: string): any;
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export async function isAdminUser(db: Db, userId: string): Promise<boolean> {
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  if (error) throw error;
  return (data || []).length > 0;
}

/** Service-role internal calls, session members and admins pass; anon → 401; others → 403. */
export async function authorizeSessionCaller(req: Request, db: Db, sessionId: string): Promise<SessionCaller> {
  const token = bearer(req);
  if (!token) throw new AuthError("Authentication required", 401);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) return { service: true, userId: null, admin: true, member: true };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new AuthError("Invalid or expired session", 401);
  const userId = data.user.id;
  const [players, memberships, session] = await Promise.all([
    db.from("game_players").select("id").eq("session_id", sessionId).eq("user_id", userId).limit(1),
    db.from("game_memberships").select("id").eq("session_id", sessionId).eq("user_id", userId).limit(1),
    db.from("game_sessions").select("created_by").eq("id", sessionId).maybeSingle(),
  ]);
  for (const r of [players, memberships, session]) if (r.error) throw r.error;
  const member = (players.data || []).length > 0 || (memberships.data || []).length > 0
    || session.data?.created_by === userId;
  const admin = await isAdminUser(db, userId);
  if (!member && !admin) throw new AuthError("Not a member of this session", 403);
  return { service: false, userId, admin, member };
}
