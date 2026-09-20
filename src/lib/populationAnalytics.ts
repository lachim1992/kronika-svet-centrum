export type PopulationLedgerRow = {
  city_id: string;
  turn_number: number;
  population_before: number;
  population_after: number;
  births: number;
  deaths: number;
  local_immigration: number;
  intercity_immigration: number;
  emigration: number;
  extraordinary_losses: number;
};

export type PopulationTurn = {
  turn: number;
  before: number;
  after: number;
  births: number;
  deaths: number;
  localImmigration: number;
  intercityImmigration: number;
  emigration: number;
  extraordinaryLosses: number;
  net: number;
};

const numeric = (value: unknown) => Number(value || 0);

/** Pure read-model aggregation. It never estimates missing demographic causes. */
export function aggregatePopulationTurns(rows: PopulationLedgerRow[]): PopulationTurn[] {
  const turns = new Map<number, PopulationTurn>();
  rows.forEach(row => {
    const turn = numeric(row.turn_number);
    const current = turns.get(turn) || {
      turn, before: 0, after: 0, births: 0, deaths: 0, localImmigration: 0,
      intercityImmigration: 0, emigration: 0, extraordinaryLosses: 0, net: 0,
    };
    current.before += numeric(row.population_before);
    current.after += numeric(row.population_after);
    current.births += numeric(row.births);
    current.deaths += numeric(row.deaths);
    current.localImmigration += numeric(row.local_immigration);
    current.intercityImmigration += numeric(row.intercity_immigration);
    current.emigration += numeric(row.emigration);
    current.extraordinaryLosses += numeric(row.extraordinary_losses);
    current.net = current.after - current.before;
    turns.set(turn, current);
  });
  return [...turns.values()].sort((a, b) => a.turn - b.turn);
}

export function populationCauseSummary(turn: PopulationTurn): Array<{ label: string; value: number }> {
  return [
    { label: "Narození", value: turn.births },
    { label: "Úmrtí", value: -turn.deaths },
    { label: "Místní přistěhování", value: turn.localImmigration },
    { label: "Přistěhování mezi městy", value: turn.intercityImmigration },
    { label: "Vystěhování", value: -turn.emigration },
    { label: "Mimořádné ztráty", value: -turn.extraordinaryLosses },
  ];
}