/** Shared by the simulation and UI. Mobilization policy is a ceiling, not soldiers. */
export const ACTIVE_POP_WEIGHTS = { peasants: 1, burghers: 0.7, clerics: 0.2, warriors: 0.9 };
export const DEFAULT_ACTIVE_POP_RATIO = 0.5;
export const DEFAULT_MAX_MOBILIZATION = 0.3;
const nonnegative = (n: unknown) => Math.max(0, Number(n) || 0);
export function computeActivePopRaw(cities: any[]): number {
  return Math.floor(cities.filter(c => !c.status || c.status === 'ok').reduce((sum, c) =>
    sum + Object.entries(ACTIVE_POP_WEIGHTS).reduce((n, [key, weight]) =>
      n + nonnegative(c[`population_${key}`]) * weight, 0), 0));
}
export function actualSoldiers(stacks: any[]): number {
  return stacks.filter(s=>s.is_active!==false).reduce((sum, s) => sum + nonnegative(s.soldiers ?? s.unit_count ??
    (s.military_stack_composition ?? s.compositions)?.reduce((n: number, c: any) => n + nonnegative(c.manpower), 0)), 0);
}
export function workforceLawModifiers(laws: any[]) {
  let active = 0, maxMobilization = 0;
  for (const law of laws.filter(l => l.is_active !== false)) {
    for (const effect of Array.isArray(law.structured_effects) ? law.structured_effects : []) {
      if (effect.type === 'active_pop_modifier') active += Number(effect.value) || 0;
      if (effect.type === 'max_mobilization_modifier') maxMobilization += Number(effect.value) || 0;
    }
  }
  return { active, maxMobilization };
}

/** Read current source rows; a cached manpower pool is never recruitment authority. */
export async function readRealmWorkforce(sb:any,session:string,player:string,rate:number) {
  async function all(table:string) {
    const result:any[]=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await sb.from(table).select('*').eq('session_id',session).order('id',{ascending:true}).range(offset,offset+499);
      if(error)throw error;if(!data)throw new Error(`Missing ${table}`);
      result.push(...data);if(data.length<500)return result;
    }
  }
  const [cities,stacks,laws]=await Promise.all(['cities','military_stacks','laws'].map(all));
  const modifiers=workforceLawModifiers(laws.filter(l=>l.player_name===player));
  const soldiers=actualSoldiers(stacks.filter(s=>(s.owner_player??s.player_name)===player));
  return computeWorkforceBreakdown(cities.filter(c=>c.owner_player===player),rate,modifiers.active,modifiers.maxMobilization,soldiers);
}
export function computeWorkforceBreakdown(cities: any[], mobilizationRate: number,
  activePopRatioModifier = 0, maxMobilizationModifier = 0, soldiers = 0) {
  const activePopRaw = computeActivePopRaw(cities);
  const effectiveRatio = Math.max(0.1, Math.min(0.9, DEFAULT_ACTIVE_POP_RATIO + activePopRatioModifier));
  const effectiveActivePop = Math.floor(activePopRaw * effectiveRatio);
  const maxMobilization = Math.max(0.05, Math.min(0.5, DEFAULT_MAX_MOBILIZATION + maxMobilizationModifier));
  const clampedMobRate = Math.max(0, Math.min(1, mobilizationRate));
  const mobilized = nonnegative(soldiers);
  const workforce = Math.max(0, effectiveActivePop - mobilized);
  const workforceRatio = effectiveActivePop > 0 ? workforce / effectiveActivePop : 0;
  const actualRate = effectiveActivePop > 0 ? mobilized / effectiveActivePop : (mobilized > 0 ? 1 : 0);
  return { activePopRaw, effectiveRatio, effectiveActivePop, maxMobilization, clampedMobRate,
    mobilizationCapacity: Math.floor(effectiveActivePop * clampedMobRate), mobilized, workforce,
    workforceRatio, effectiveWorkforceRatio: workforceRatio, overMobPenalty: 0,
    isOverMob: actualRate > maxMobilization, actualRate };
}
