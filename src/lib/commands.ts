/**
 * dispatchCommand — single client-side entry point for all game commands.
 *
 * Wraps the command-dispatch Edge Function.
 * All game state mutations should go through this helper.
 */
import { supabase } from "@/integrations/supabase/client";

interface CommandActor {
  name: string;
  type?: "player" | "system" | "ai_faction";
  id?: string;
}

interface DispatchResult {
  ok: boolean;
  idempotent: boolean;
  events: Array<{ id: string; event_type: string; command_id: string }>;
  /** Server-side side-effect results (e.g. cityId for FOUND_CITY) */
  sideEffects?: Record<string, any>;
  error?: string;
}

export async function dispatchCommand(params: {
  sessionId: string;
  turnNumber?: number;
  actor: CommandActor;
  commandType: string;
  commandPayload: Record<string, any>;
  commandId?: string;
}): Promise<DispatchResult> {
  const commandId = params.commandId || crypto.randomUUID();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data, error } = await supabase.functions.invoke("command-dispatch", {
    body: {
      sessionId: params.sessionId,
      turnNumber: params.turnNumber,
      actor: {
        name: params.actor.name,
        type: params.actor.type || "player",
        id: params.actor.id || session?.user?.id,
      },
      commandType: params.commandType,
      commandPayload: params.commandPayload,
      commandId,
    },
  });

  if (error) {
    // Try to extract body from FunctionsHttpError
    let body: any = null;
    try {
      if (error.context && typeof error.context === "object" && "json" in error.context) {
        body = await (error.context as Response).json();
      }
    } catch { /* ignore */ }

    return {
      ok: false,
      idempotent: false,
      events: [],
      error: body?.error || error.message || "Unknown error",
    };
  }

  return data as DispatchResult;
}
