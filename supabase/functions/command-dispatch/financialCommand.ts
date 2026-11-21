/** Finance uses its own atomic SQL journal, not the gateway's best-effort event precheck.
 * GRANT_PRIVATE_LIQUIDITY: explicit STATE gold_reserve -> own city-group PRIVATE account, opt-in sessions only (SQL enforces).
 * STATE has no account: FUND/REMIT move realm_resources.gold_reserve inside the same SQL transaction; only verified human seats can command new accounts.
 */
export const FINANCIAL_COMMANDS = new Set(['CREATE_FINANCIAL_ACCOUNT', 'TRANSFER_FINANCIAL_FUNDS', 'FUND_MUNICIPAL_ACCOUNT', 'REMIT_MUNICIPAL_TO_STATE', 'GRANT_PRIVATE_LIQUIDITY']);

export async function executeFinancialCommand(
  db: any, sessionId: string, userId: string | null, commandId: string, commandType: string, args: unknown,
) {
  if (!userId) return { error: 'Finanční příkaz vyžaduje ověřené hráčské sedadlo', status: 403 };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(sessionId) || !uuid.test(commandId) || !FINANCIAL_COMMANDS.has(commandType)
    || !args || typeof args !== 'object' || Array.isArray(args)) {
    return { error: 'Neplatný finanční příkaz', status: 400 };
  }
  // SQL validates every argument, including ownership, exact decimal precision and same-session accounts.
  const { data, error } = await db.rpc('execute_financial_command', {
    p_session: sessionId, p_actor: userId, p_command: commandId, p_type: commandType, p_args: args,
  });
  if (error) return { error: error.message, status: /conflict|key already used/.test(error.message) ? 409 : 400 };
  if (!data || !Array.isArray(data.events)) return { error: 'Účetní příkaz nevrátil potvrzení', status: 500 };
  return { ok: true, events: data.events, idempotent: data.idempotent === true, sideEffects: { finance: data } };
}