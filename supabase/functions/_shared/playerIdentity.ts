export class PlayerIdentityError extends Error {
  constructor(message: string, public status: 401 | 403 | 500) { super(message); }
}

export interface PlayerActor { name: string; type?: string; id?: string }

/**
 * Human gameplay identity comes only from the verified JWT and its game_players seat.
 * A body-supplied name is presentation metadata, never authority to act for another realm.
 */
export async function requirePlayerSeat(supabase: any, sessionId: string, actor: PlayerActor, jwt: string | null): Promise<PlayerActor> {
  if (!jwt) throw new PlayerIdentityError("Authentication required", 401);
  const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (authError || !userId) throw new PlayerIdentityError("Invalid or expired session", 401);
  const { data: seat, error: seatError } = await supabase.from("game_players")
    .select("player_name").eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
  if (seatError) throw new PlayerIdentityError(seatError.message, 500);
  if (!seat?.player_name) throw new PlayerIdentityError("Nemáte v této hře hráčské sedadlo", 403);
  return { ...actor, id: userId, name: seat.player_name };
}
