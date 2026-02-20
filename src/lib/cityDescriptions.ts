/**
 * Generate a deterministic city description based on population data.
 * Used as fallback when LLM is unavailable or to avoid unnecessary AI calls.
 */
export function generateDeterministicCityDescription(city: {
  name: string;
  settlement_level?: string;
  population_total?: number;
  population_peasants?: number;
  population_burghers?: number;
  population_clerics?: number;
  city_stability?: number;
  famine_turn?: boolean;
  famine_severity?: number;
  local_grain_reserve?: number;
  local_granary_capacity?: number;
  owner_player?: string;
}): string {
  const pop = city.population_total || 0;
  const peasantPct = pop > 0 ? (city.population_peasants || 0) / pop : 0;
  const burgherPct = pop > 0 ? (city.population_burghers || 0) / pop : 0;
  const clericPct = pop > 0 ? (city.population_clerics || 0) / pop : 0;
  const stability = city.city_stability || 70;

  const LEVEL_NAMES: Record<string, string> = {
    HAMLET: "malá osada", TOWNSHIP: "rostoucí městečko", CITY: "rušné město", POLIS: "mocná polis",
  };
  const levelName = LEVEL_NAMES[city.settlement_level || "HAMLET"] || "osídlení";

  // Society type
  let societyDesc: string;
  if (peasantPct > 0.65) {
    societyDesc = "Většina obyvatel žije z obdělávání půdy a pastevectví.";
  } else if (burgherPct > 0.45) {
    societyDesc = "Obchodníci a řemeslníci tvoří jádro společnosti.";
  } else if (clericPct > 0.25) {
    societyDesc = "Duchovenstvo a učenci mají v městě významný vliv.";
  } else {
    societyDesc = "Společnost je rozmanitá, s vyváženým zastoupením všech vrstev.";
  }

  // Size descriptor
  let sizeDesc: string;
  if (pop < 500) sizeDesc = `s pouhými ${pop} dušemi`;
  else if (pop < 2000) sizeDesc = `s přibližně ${pop.toLocaleString()} obyvateli`;
  else if (pop < 8000) sizeDesc = `domovem ${pop.toLocaleString()} lidí`;
  else sizeDesc = `kde žije na ${pop.toLocaleString()} obyvatel`;

  let result = `${city.name} je ${levelName} ${sizeDesc} pod vládou ${city.owner_player || "neznámého pána"}. ${societyDesc}`;

  // Stability
  if (stability < 30) {
    result += " Nepokoje a nespokojenost se šíří ulicemi.";
  } else if (stability < 50) {
    result += " Napětí mezi obyvateli je citelné.";
  } else if (stability > 80) {
    result += " Panuje zde klid a pořádek.";
  }

  // Famine
  if (city.famine_turn) {
    result += ` Město trpí hladomorem — zásoby obilí nedostačují a lidé hladoví.`;
  } else if ((city.local_grain_reserve || 0) > 0 && (city.local_granary_capacity || 0) > 0) {
    const fillPct = Math.round(((city.local_grain_reserve || 0) / (city.local_granary_capacity || 1)) * 100);
    if (fillPct > 70) {
      result += " Sýpky jsou dobře zásobeny.";
    } else if (fillPct < 30) {
      result += " Zásoby v sýpkách jsou nízké.";
    }
  }

  return result;
}

/**
 * Check whether a city description should be regenerated.
 * Returns true if significant changes occurred since last generation.
 */
export function shouldRegenerateDescription(city: {
  population_total?: number;
  settlement_level?: string;
  city_stability?: number;
  famine_turn?: boolean;
  city_description_last_turn?: number;
}, previousPop: number, previousLevel: string, previousStability: number, previousFamine: boolean): boolean {
  const pop = city.population_total || 0;
  const popChange = previousPop > 0 ? Math.abs(pop - previousPop) / previousPop : 1;
  
  // Population changed by >= 10%
  if (popChange >= 0.1) return true;
  
  // Settlement level changed
  if ((city.settlement_level || "HAMLET") !== previousLevel) return true;
  
  // Stability crossed threshold
  const stab = city.city_stability || 70;
  const thresholds = [30, 50, 70];
  for (const t of thresholds) {
    if ((previousStability >= t && stab < t) || (previousStability < t && stab >= t)) return true;
  }
  
  // Famine state changed
  if ((city.famine_turn || false) !== previousFamine) return true;
  
  return false;
}
