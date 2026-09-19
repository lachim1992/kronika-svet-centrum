export class SportsError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Validate identity before using the service-role database for a sports command. */
export async function sportsActor(req: Request, db: any, sessionId: string, playerName?: string) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new SportsError('Přihlášení je vyžadováno.', 401);
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return {service: true, admin: true, playerName};
  const {data, error} = await db.auth.getUser(token);
  if (error || !data?.user) throw new SportsError('Neplatné přihlášení.', 401);
  const members = await db.from('game_players').select('player_name').eq('session_id', sessionId).eq('user_id', data.user.id);
  if (members.error) throw members.error;
  const member = (members.data || []).find((m: any) => !playerName || m.player_name === playerName);
  if (!member) throw new SportsError('Nemáte přístup k tomuto hráči nebo hře.', 403);
  const roles = await db.from('user_roles').select('role').eq('user_id', data.user.id);
  if (roles.error) throw roles.error;
  return {service: false, admin: (roles.data || []).some((r: any) => ['admin', 'moderator'].includes(r.role)), playerName: member.player_name};
}

export function requireSportsHost(actor: {admin: boolean; playerName?: string}, festival: any) {
  if (!actor.admin && actor.playerName !== festival.host_player) throw new SportsError('Akci může provést pouze pořadatel nebo správce.', 403);
}
