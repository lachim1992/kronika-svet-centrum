/**
 * Shared Demographics Module
 * Housing capacity, social mobility, migration, epidemics.
 * Used by commit-turn alongside physics.ts.
 */

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════

// Housing: base per settlement level + district capacity
export const BASE_HOUSING: Record<string, number> = {
  HAMLET: 400,
  TOWNSHIP: 800,
  CITY: 1500,
  POLIS: 3000,
};

// Social mobility rates (per turn, fraction of layer that can transition)
export const MOBILITY_BASE_RATE = 0.005; // 0.5% base
export const MOBILITY_SCRIBES_FACTOR = 0.002; // per % of scribes allocation
export const MOBILITY_MARKET_FACTOR = 0.003; // per market_level
export const MOBILITY_TEMPLE_FACTOR = 0.002; // per temple_level

// Migration
export const MIGRATION_STABILITY_THRESHOLD = 45; // below this, people emigrate
export const MIGRATION_ATTRACT_THRESHOLD = 60; // above this, city attracts
export const MIGRATION_MAX_RATE = 0.03; // max 3% of pop per turn
export const MIGRATION_FAMINE_PUSH = 0.02; // extra push during famine

// Epidemics
export const EPIDEMIC_OVERCROWDING_THRESHOLD = 1.2; // ratio > 1.2 triggers risk
export const EPIDEMIC_BASE_CHANCE = 0.05; // 5% base per turn when overcrowded
export const EPIDEMIC_OVERCROWDING_FACTOR = 0.15; // per 0.1 over threshold
export const EPIDEMIC_MORTALITY_BASE = 0.03; // 3% base mortality
export const EPIDEMIC_MORTALITY_SEVERE = 0.08; // severe (stability < 30)
export const EPIDEMIC_DURATION_TURNS = 3;
export const EPIDEMIC_STABILITY_LOSS = 8;

// ═══════════════════════════════════════════
// HOUSING CAPACITY
// ═══════════════════════════════════════════

export interface HousingInput {
  settlement_level: string;
  districts: Array<{ population_capacity: number; status: string }>;
  buildings: Array<{ effects: Record<string, number>; status: string }>;
}

export function computeHousingCapacity(input: HousingInput): number {
  const base = BASE_HOUSING[input.settlement_level] || 400;
  const districtCap = input.districts
    .filter(d => d.status === "completed")
    .reduce((s, d) => s + (d.population_capacity || 0), 0);
  const buildingCap = input.buildings
    .filter(b => b.status === "completed")
    .reduce((s, b) => s + ((b.effects as any)?.housing_capacity || 0), 0);
  return base + districtCap + buildingCap;
}

export function computeOvercrowdingRatio(population: number, housingCapacity: number): number {
  if (housingCapacity <= 0) return population > 0 ? 2.0 : 0;
  return Math.round((population / housingCapacity) * 100) / 100;
}

// ═══════════════════════════════════════════
// SOCIAL MOBILITY
// ═══════════════════════════════════════════

export interface MobilityInput {
  population_peasants: number;
  population_burghers: number;
  population_clerics: number;
  population_total: number;
  market_level: number;
  temple_level: number;
  labor_allocation: { scribes?: number };
  city_stability: number;
}

export interface MobilityResult {
  peasants_to_burghers: number;
  burghers_to_clerics: number;
  new_peasants: number;
  new_burghers: number;
  new_clerics: number;
  mobility_rate: number;
}

/**
 * Compute social mobility: peasants → burghers → clerics.
 * Driven by market_level, scribes allocation, temple_level.
 */
export function computeSocialMobility(input: MobilityInput): MobilityResult {
  const scribesAlloc = (input.labor_allocation?.scribes || 0) / 100;
  const stabilityFactor = Math.max(0, (input.city_stability - 30) / 70); // 0-1

  // Peasant → Burgher rate (driven by market + scribes)
  const pbRate = (MOBILITY_BASE_RATE + 
    scribesAlloc * MOBILITY_SCRIBES_FACTOR * 100 +
    input.market_level * MOBILITY_MARKET_FACTOR) * stabilityFactor;

  // Burgher → Cleric rate (driven by temple + scribes)
  const bcRate = (MOBILITY_BASE_RATE * 0.5 +
    input.temple_level * MOBILITY_TEMPLE_FACTOR +
    scribesAlloc * MOBILITY_SCRIBES_FACTOR * 50) * stabilityFactor;

  const peasantsToBurghers = Math.max(0, Math.round(input.population_peasants * pbRate));
  const burghersToCleric = Math.max(0, Math.round(input.population_burghers * bcRate));

  const newPeasants = input.population_peasants - peasantsToBurghers;
  const newBurghers = input.population_burghers + peasantsToBurghers - burghersToCleric;
  const newClerics = input.population_clerics + burghersToCleric;

  const totalMobRate = input.population_total > 0 
    ? (peasantsToBurghers + burghersToCleric) / input.population_total 
    : 0;

  return {
    peasants_to_burghers: peasantsToBurghers,
    burghers_to_clerics: burghersToCleric,
    new_peasants: Math.max(0, newPeasants),
    new_burghers: Math.max(0, newBurghers),
    new_clerics: Math.max(0, newClerics),
    mobility_rate: Math.round(totalMobRate * 1000) / 1000,
  };
}

// ═══════════════════════════════════════════
// MIGRATION
// ═══════════════════════════════════════════

export interface MigrationCity {
  id: string;
  name: string;
  owner_player: string;
  population_total: number;
  population_peasants: number;
  city_stability: number;
  famine_turn: boolean;
  overcrowding_ratio: number;
  housing_capacity: number;
  demo_policy?: string; // active demographic policy key
}
  name: string;
  owner_player: string;
  population_total: number;
  population_peasants: number;
  city_stability: number;
  famine_turn: boolean;
  overcrowding_ratio: number;
  housing_capacity: number;
}

export interface MigrationFlow {
  from_city_id: string;
  to_city_id: string;
  from_city_name: string;
  to_city_name: string;
  migrants: number;
  reason: string;
}

/**
 * Compute migration flows between cities of the same player.
 * Unstable/overcrowded/famine cities push population to stable ones.
 */
export function computeMigrationFlows(cities: MigrationCity[]): MigrationFlow[] {
  const flows: MigrationFlow[] = [];

  // Group by owner
  const byOwner: Record<string, MigrationCity[]> = {};
  for (const c of cities) {
    (byOwner[c.owner_player] = byOwner[c.owner_player] || []).push(c);
  }

  for (const ownerCities of Object.values(byOwner)) {
    if (ownerCities.length < 2) continue;

    // Identify push (emigration) and pull (immigration) cities
    const pushCities = ownerCities.filter(c => 
      c.city_stability < MIGRATION_STABILITY_THRESHOLD || 
      c.famine_turn || 
      c.overcrowding_ratio > EPIDEMIC_OVERCROWDING_THRESHOLD
    );
    const pullCities = ownerCities.filter(c => {
      const isOpen = c.demo_policy === "open_gates";
      const stabThreshold = isOpen ? MIGRATION_ATTRACT_THRESHOLD - 10 : MIGRATION_ATTRACT_THRESHOLD;
      return c.city_stability >= stabThreshold && 
        !c.famine_turn && 
        c.overcrowding_ratio < (isOpen ? 1.0 : 0.9);
    });

    if (pushCities.length === 0 || pullCities.length === 0) continue;

    for (const src of pushCities) {
      // Calculate push strength
      let pushRate = 0;
      let reason = "";
      if (src.famine_turn) { pushRate += MIGRATION_FAMINE_PUSH; reason = "hladomor"; }
      if (src.city_stability < MIGRATION_STABILITY_THRESHOLD) {
        pushRate += (MIGRATION_STABILITY_THRESHOLD - src.city_stability) / 1000;
        reason = reason ? `${reason} + nestabilita` : "nestabilita";
      }
      if (src.overcrowding_ratio > EPIDEMIC_OVERCROWDING_THRESHOLD) {
        pushRate += (src.overcrowding_ratio - 1) * 0.01;
        reason = reason ? `${reason} + přelidnění` : "přelidnění";
      }
      // Demographic policy: closed_gates reduces emigration, open_gates increases
      const srcPolicy = src.demo_policy;
      if (srcPolicy === "closed_gates") pushRate *= 0.3; // drastically reduce
      else if (srcPolicy === "open_gates") pushRate *= 1.3;
      pushRate = Math.min(MIGRATION_MAX_RATE, pushRate);
      const totalMigrants = Math.round(src.population_peasants * pushRate);
      if (totalMigrants < 1) continue;

      // Distribute among pull cities proportionally to their attractiveness
      const totalAttract = pullCities.reduce((s, c) => s + (c.city_stability - 40), 0);
      if (totalAttract <= 0) continue;

      for (const dst of pullCities) {
        const share = (dst.city_stability - 40) / totalAttract;
        const migrants = Math.max(1, Math.round(totalMigrants * share));
        // Don't exceed housing
        const roomLeft = Math.max(0, dst.housing_capacity - dst.population_total);
        const actual = Math.min(migrants, roomLeft);
        if (actual > 0) {
          flows.push({
            from_city_id: src.id, to_city_id: dst.id,
            from_city_name: src.name, to_city_name: dst.name,
            migrants: actual, reason,
          });
        }
      }
    }
  }

  return flows;
}

// ═══════════════════════════════════════════
// EPIDEMIC EVALUATION
// ═══════════════════════════════════════════

export interface EpidemicResult {
  city_id: string;
  city_name: string;
  triggered: boolean;
  mortality: number; // absolute pop loss
  mortality_peasants: number;
  mortality_burghers: number;
  mortality_clerics: number;
  stability_loss: number;
  reason: string;
}

/**
 * Evaluate epidemic risk for a single city.
 * Triggered by overcrowding + low stability. Deterministic seed.
 */
export function evaluateEpidemic(
  city: {
    id: string; name: string;
    population_total: number; population_peasants: number;
    population_burghers: number; population_clerics: number;
    overcrowding_ratio: number; city_stability: number;
    epidemic_active: boolean; epidemic_turn_start: number | null;
    disease_level: number;
  },
  turnNumber: number,
  seedOffset = 0
): EpidemicResult | null {
  // Already active epidemic — compute ongoing mortality
  if (city.epidemic_active && city.epidemic_turn_start) {
    const elapsed = turnNumber - city.epidemic_turn_start;
    if (elapsed >= EPIDEMIC_DURATION_TURNS) {
      // Epidemic ends
      return {
        city_id: city.id, city_name: city.name,
        triggered: false, mortality: 0,
        mortality_peasants: 0, mortality_burghers: 0, mortality_clerics: 0,
        stability_loss: 0, reason: "epidemie skončila",
      };
    }
    // Ongoing mortality
    const severeMultiplier = city.city_stability < 30 ? 1.5 : 1.0;
    const mortalityRate = EPIDEMIC_MORTALITY_BASE * severeMultiplier;
    const mortality = Math.round(city.population_total * mortalityRate);
    return {
      city_id: city.id, city_name: city.name,
      triggered: true, mortality,
      mortality_peasants: Math.round(city.population_peasants * mortalityRate * 1.2), // peasants hit harder
      mortality_burghers: Math.round(city.population_burghers * mortalityRate),
      mortality_clerics: Math.round(city.population_clerics * mortalityRate * 0.8), // clerics slightly protected
      stability_loss: EPIDEMIC_STABILITY_LOSS,
      reason: `epidemie pokračuje (kolo ${elapsed + 1}/${EPIDEMIC_DURATION_TURNS})`,
    };
  }

  // Check if new epidemic triggers
  if (city.overcrowding_ratio <= EPIDEMIC_OVERCROWDING_THRESHOLD) return null;

  const overAmount = city.overcrowding_ratio - EPIDEMIC_OVERCROWDING_THRESHOLD;
  const chance = EPIDEMIC_BASE_CHANCE + overAmount * EPIDEMIC_OVERCROWDING_FACTOR * 10;

  // Deterministic roll
  const seed = turnNumber * 37 + city.name.length * 11 + seedOffset;
  const roll = (seed % 100) / 100;

  if (roll >= chance) return null; // No epidemic

  // New epidemic!
  const mortalityRate = city.city_stability < 30 ? EPIDEMIC_MORTALITY_SEVERE : EPIDEMIC_MORTALITY_BASE;
  const mortality = Math.round(city.population_total * mortalityRate);

  return {
    city_id: city.id, city_name: city.name,
    triggered: true, mortality,
    mortality_peasants: Math.round(city.population_peasants * mortalityRate * 1.2),
    mortality_burghers: Math.round(city.population_burghers * mortalityRate),
    mortality_clerics: Math.round(city.population_clerics * mortalityRate * 0.8),
    stability_loss: EPIDEMIC_STABILITY_LOSS,
    reason: "nová epidemie vypukla z přelidnění",
  };
}

// ═══════════════════════════════════════════
// DEMOGRAPHIC POLICIES
// ═══════════════════════════════════════════

export const DEMOGRAPHIC_POLICIES: Record<string, {
  label: string;
  description: string;
  key: string;
  effects: {
    mobility_modifier: number; // multiplier on social mobility
    migration_modifier: number; // positive = attract, negative = push
    birth_rate_modifier: number;
    housing_modifier: number;
    stability_effect: number;
  };
}> = {
  open_gates: {
    label: "Otevřené brány",
    description: "Město přijímá nové osadníky. Zvyšuje příliv migrantů, ale snižuje stabilitu.",
    key: "open_gates",
    effects: { mobility_modifier: 0, migration_modifier: 0.02, birth_rate_modifier: 0, housing_modifier: 0, stability_effect: -3 },
  },
  closed_gates: {
    label: "Uzavřené brány",
    description: "Město odmítá nové osadníky. Zastavuje migraci, zvyšuje stabilitu.",
    key: "closed_gates",
    effects: { mobility_modifier: 0, migration_modifier: -0.05, birth_rate_modifier: 0, housing_modifier: 0, stability_effect: 3 },
  },
  guild_charter: {
    label: "Cechovní listina",
    description: "Podpora řemeslnických cechů. Urychluje přechod sedláků na měšťany.",
    key: "guild_charter",
    effects: { mobility_modifier: 1.5, migration_modifier: 0, birth_rate_modifier: 0, housing_modifier: 0, stability_effect: 0 },
  },
  natalist: {
    label: "Pronatální edikt",
    description: "Pobídky k většímu počtu dětí. Zvyšuje porodnost, ale vyžaduje více obilí.",
    key: "natalist",
    effects: { mobility_modifier: 0, migration_modifier: 0, birth_rate_modifier: 0.005, housing_modifier: 0, stability_effect: -1 },
  },
  quarantine: {
    label: "Karanténa",
    description: "Přísná hygiena. Snižuje riziko epidemie, ale omezuje obchod a mobilitu.",
    key: "quarantine",
    effects: { mobility_modifier: -0.5, migration_modifier: -0.03, birth_rate_modifier: 0, housing_modifier: 0, stability_effect: 2 },
  },
  housing_decree: {
    label: "Stavební dekret",
    description: "Investice do obytných prostor. Zvyšuje kapacitu bydlení.",
    key: "housing_decree",
    effects: { mobility_modifier: 0, migration_modifier: 0.01, birth_rate_modifier: 0, housing_modifier: 100, stability_effect: 1 },
  },
};

/**
 * Compute birth/death rates for a city.
 * Now integrates active demographic policy effects.
 */
export function computeBirthDeathRate(city: {
  population_total: number;
  city_stability: number;
  famine_turn: boolean;
  overcrowding_ratio: number;
  epidemic_active: boolean;
}, activeDemoPolicy?: string): { birthRate: number; deathRate: number; naturalGrowth: number } {
  const policyEffects = activeDemoPolicy ? DEMOGRAPHIC_POLICIES[activeDemoPolicy]?.effects : undefined;

  // Base rates
  let birthRate = 0.012;
  let deathRate = 0.005;

  // Stability modifier
  birthRate += (city.city_stability - 50) / 5000;
  deathRate -= (city.city_stability - 50) / 10000;

  // Famine
  if (city.famine_turn) {
    birthRate *= 0.5;
    deathRate += 0.01;
  }

  // Overcrowding
  if (city.overcrowding_ratio > 1.0) {
    deathRate += (city.overcrowding_ratio - 1.0) * 0.005;
  }

  // Epidemic
  if (city.epidemic_active) {
    deathRate += 0.02;
    birthRate *= 0.7;
  }

  // Demographic policy effects
  if (policyEffects) {
    birthRate += policyEffects.birth_rate_modifier || 0;
    // Quarantine reduces disease → slightly lower death rate
    if (activeDemoPolicy === "quarantine") {
      deathRate *= 0.85;
    }
  }

  birthRate = Math.max(0, Math.min(0.03, birthRate));
  deathRate = Math.max(0.001, Math.min(0.05, deathRate));

  const naturalGrowth = Math.round(city.population_total * (birthRate - deathRate));

  return {
    birthRate: Math.round(birthRate * 1000) / 1000,
    deathRate: Math.round(deathRate * 1000) / 1000,
    naturalGrowth,
  };
}
