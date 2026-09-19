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
