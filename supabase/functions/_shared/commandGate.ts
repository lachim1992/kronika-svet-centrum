/** Player commands are refused while a turn resolves; AI/system actors run inside the resolution. */
export const TURN_RESOLVING_MESSAGE = "Tah se právě uzavírá. Počkejte na dokončení a zkuste to znovu.";
export function turnResolvingRefusal(session: { resolving_turn?: number | null }, actorType?: string) {
  if (session.resolving_turn == null || actorType === "ai_faction" || actorType === "system") return null;
  return { ok: false as const, idempotent: false as const, events: [] as never[], code: "TURN_RESOLVING" as const, error: TURN_RESOLVING_MESSAGE };
}
