/** Missing home/away fixtures, packed so no club plays twice in one round. */
export function missingFixtureRounds(ids: string[], played: {home_team_id: string; away_team_id: string}[]) {
  const seen = new Set(played.map(m => `${m.home_team_id}:${m.away_team_id}`));
  const rounds: [string, string][][] = [];
  for (const home of [...new Set(ids)]) for (const away of [...new Set(ids)]) {
    if (home === away || seen.has(`${home}:${away}`)) continue;
    let round = rounds.find(r => !r.some(([h, a]) => h === home || a === home || h === away || a === away));
    if (!round) { round = []; rounds.push(round); }
    round.push([home, away]);
  }
  return rounds;
}

export function nominationIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3 ||
      value.some(id => typeof id !== 'string' || !id.trim()) || new Set(value).size !== value.length) {
    throw new Error('Vyberte 1 až 3 různé sportovce.');
  }
  return value;
}

export function batchRoundCount(value: unknown = 5): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error('Počet kol musí být celé číslo od 1 do 10.');
  }
  return value;
}

/** Rounds resolved inside a single game turn, so a season finishes in a plausible number of turns. */
export const ROUNDS_PER_TURN = 3;

export function roundsPerTurn(value: unknown = ROUNDS_PER_TURN): number {
  if (value === undefined || value === null) return ROUNDS_PER_TURN;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error('Počet kol za tah musí být celé číslo od 1 do 10.');
  }
  return value;
}

export interface SeasonPhase { league_tier: number | null; status: string | null; playoff_status: string | null }

/** A lower league may only open once every league above it has a decided table and a decided cup. */
export function lowerTierStartBlocker(tier: number, seasons: SeasonPhase[]): { tier: number; phase: string; reason: string } | null {
  if (tier <= 1) return null;
  for (const season of seasons) {
    const above = season.league_tier ?? 1;
    if (above >= tier) continue;
    const tableOpen = (season.status ?? 'active') !== 'concluded';
    const cupOpen = !!season.playoff_status && season.playoff_status !== 'completed' && season.playoff_status !== 'none';
    if (!tableOpen && !cupOpen) continue;
    const phase = cupOpen ? 'cup' : 'table';
    return { tier: above, phase, reason: cupOpen
      ? `${tier}. liga čeká na dohrání poháru ${above}. ligy — teprve pak je jasné, kdo spadne.`
      : `${tier}. liga čeká na dokončení tabulky ${above}. ligy — teprve pak je jasné, kdo spadne.` };
  }
  return null;
}

