// Faction ↔ Council integration helpers

import { FACTION_TYPES } from "@/lib/cityGovernance";

// How each faction reacts to different decree types
// Positive = support, negative = oppose
const FACTION_DECREE_STANCE: Record<string, Record<string, number>> = {
  peasants: {
    law: 0,
    tax: -8,             // don't like taxes
    military_reform: -5, // fear conscription
    diplomatic_shift: 0,
    religious_decree: 3,
  },
  burghers: {
    law: 2,
    tax: -6,
    military_reform: -3,
    diplomatic_shift: 5, // like trade openings
    religious_decree: -2,
  },
  clergy: {
    law: 0,
    tax: -2,
    military_reform: -5,
    diplomatic_shift: 0,
    religious_decree: 12, // love religious decrees
  },
  military: {
    law: 0,
    tax: 3,               // taxes fund army
    military_reform: 10,  // love military spending
    diplomatic_shift: -5, // prefer war
    religious_decree: 0,
  },
};

// Effect value modifiers: positive effects = more support, negative = opposition
const VALUE_MODIFIER_MAP: Record<string, Record<string, number>> = {
  peasants: { tax_change: -2, military_funding: -1, civil_reform: 2, trade_restriction: -1 },
  burghers: { tax_change: -2, military_funding: -1, civil_reform: 1, trade_restriction: -3 },
  clergy: { tax_change: -1, military_funding: -1, civil_reform: 1, trade_restriction: 0 },
  military: { tax_change: 1, military_funding: 3, civil_reform: 0, trade_restriction: 0 },
};

export interface FactionVote {
  factionType: string;
  label: string;
  icon: string;
  stance: "support" | "oppose" | "neutral";
  stanceValue: number;
  reason: string;
  satisfactionImpact: number; // how much satisfaction changes if enacted
  loyaltyImpact: number;     // how much loyalty changes if enacted
}

/**
 * Compute faction reactions to a proposed decree
 */
export function computeFactionReactions(
  factions: any[],
  decreeType: string,
  effects?: { type: string; value: number }[]
): FactionVote[] {
  return factions.map(f => {
    const meta = FACTION_TYPES[f.faction_type];
    if (!meta) return null;

    // Base stance from decree type
    let stanceValue = FACTION_DECREE_STANCE[f.faction_type]?.[decreeType] ?? 0;

    // Modify based on effects
    if (effects) {
      for (const eff of effects) {
        const modifier = VALUE_MODIFIER_MAP[f.faction_type]?.[eff.type] ?? 0;
        stanceValue += modifier * Math.sign(eff.value) * Math.min(3, Math.abs(eff.value));
      }
    }

    // Scale by faction current satisfaction (unhappy factions are more critical)
    if (f.satisfaction < 30) stanceValue -= 3;
    if (f.satisfaction < 15) stanceValue -= 5;

    const stance: "support" | "oppose" | "neutral" =
      stanceValue >= 3 ? "support" : stanceValue <= -3 ? "oppose" : "neutral";

    // Compute impacts if enacted
    const satisfactionImpact = Math.round(stanceValue * 0.8);
    const loyaltyImpact = Math.round(stanceValue * 0.4);

    const reason = getStanceReason(f.faction_type, decreeType, stance, f.satisfaction);

    return {
      factionType: f.faction_type,
      label: meta.label,
      icon: meta.icon,
      stance,
      stanceValue,
      reason,
      satisfactionImpact,
      loyaltyImpact,
    };
  }).filter(Boolean) as FactionVote[];
}

function getStanceReason(factionType: string, decreeType: string, stance: string, satisfaction: number): string {
  const reasons: Record<string, Record<string, Record<string, string>>> = {
    peasants: {
      tax: { oppose: "Lid nesouhlasí s dalším zdaněním. Hladoví nemohou platit víc.", support: "Pokud přinese mír, lid přijme i oběti.", neutral: "Lid vyčkává na důsledky." },
      military_reform: { oppose: "Rolníci se obávají nuceného odvodu synů do vojska.", support: "Ochrana hranic je důležitá.", neutral: "Lid je opatrný." },
      religious_decree: { support: "Věřící lid vítá boží požehnání.", oppose: "Lid se bojí fanatismu.", neutral: "Lid přijímá s respektem." },
    },
    burghers: {
      tax: { oppose: "Obchodníci protestují: daně ničí prosperitu!", support: "Investice se vyplatí.", neutral: "Obezřetný souhlas." },
      diplomatic_shift: { support: "Nové obchodní cesty! Měšťané jásají.", oppose: "Izolace škodí obchodu.", neutral: "Vyčkáváme na podmínky." },
      trade_restriction: { oppose: "Tržiště si žádá svobodu!", support: "Regulace chrání místní řemesla.", neutral: "Smíšené reakce." },
    },
    clergy: {
      religious_decree: { support: "Bohové žehnají moudrému vládci!", oppose: "Toto je hereze!", neutral: "Klérus zvažuje teologické důsledky." },
      military_reform: { oppose: "Boží služebníci odmítají krveprolití.", support: "Obrana víry je povinnost.", neutral: "Duchovní se modlí za mír." },
    },
    military: {
      military_reform: { support: "Vojáci salutují! Silná armáda je silná říše.", oppose: "Degradace armády je zrada!", neutral: "Čekáme na rozkazy." },
      tax: { support: "Více zlata pro zbrojnice!", oppose: "Nedotýkejte se vojenského rozpočtu.", neutral: "Přijatelné." },
      diplomatic_shift: { oppose: "Diplomacie je pro slabé!", support: "Strategický ústupek může být moudrý.", neutral: "Přijato bez nadšení." },
    },
  };

  return reasons[factionType]?.[decreeType]?.[stance]
    || (stance === "support" ? `${FACTION_TYPES[factionType]?.label || factionType} souhlasí.`
       : stance === "oppose" ? `${FACTION_TYPES[factionType]?.label || factionType} protestuje.`
       : `${FACTION_TYPES[factionType]?.label || factionType} nemá vyhraněný postoj.`);
}

/**
 * Compute overall voting result
 */
export function computeVotingResult(votes: FactionVote[]): {
  approved: boolean;
  supportCount: number;
  opposeCount: number;
  stabilityPenalty: number;
  summary: string;
} {
  const supportCount = votes.filter(v => v.stance === "support").length;
  const opposeCount = votes.filter(v => v.stance === "oppose").length;
  const totalWeight = votes.reduce((s, v) => s + Math.abs(v.stanceValue), 0);
  const supportWeight = votes.filter(v => v.stanceValue > 0).reduce((s, v) => s + v.stanceValue, 0);
  const opposeWeight = votes.filter(v => v.stanceValue < 0).reduce((s, v) => s + Math.abs(v.stanceValue), 0);

  const approved = supportWeight >= opposeWeight;
  const stabilityPenalty = !approved ? Math.round(opposeWeight * 0.5) : 0;

  const summary = approved
    ? supportCount === votes.length
      ? "Jednomyslný souhlas rady!"
      : `Rada schválila dekret (${supportCount} pro, ${opposeCount} proti).`
    : `Rada odmítla dekret (${opposeCount} proti, ${supportCount} pro). Vynucení sníží stabilitu o ${stabilityPenalty}.`;

  return { approved, supportCount, opposeCount, stabilityPenalty, summary };
}

/**
 * Compute satisfaction/loyalty changes for enacting a decree
 */
export function computeDecreeImpacts(votes: FactionVote[]): Record<string, { satisfaction: number; loyalty: number }> {
  const impacts: Record<string, { satisfaction: number; loyalty: number }> = {};
  for (const v of votes) {
    impacts[v.factionType] = {
      satisfaction: v.satisfactionImpact,
      loyalty: v.loyaltyImpact,
    };
  }
  return impacts;
}
