import { memo } from "react";

export type SquadKind = "foot" | "horse" | "siege";

export function squadKind(formation: string | null | undefined): SquadKind {
  const f = (formation || "").toLowerCase();
  if (/cav|horse|jízd|jizd|rider|mounted/.test(f)) return "horse";
  if (/siege|oblé|oble|catap|ram/.test(f)) return "siege";
  return "foot";
}

/** Four visual strength stages; full detachment = 18 soldiers and two rear commanders. */
export function squadFigures(men: number): number {
  return men <= 0 ? 0 : men > 175 ? 20 : men > 125 ? 15 : men > 75 ? 10 : 5;
}

/** Six ranks of three, projected onto the isometric ground plane. */
const SOLDIER_SLOTS: Array<[number, number]> = [];
for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) {
  SOLDIER_SLOTS.push([(c - r + 1.5) * .95, (c + r - 3.5) * .48]);
}
const COMMANDER_SLOTS: Array<[number, number]> = [[2.85, -2.4], [3.8, -1.92]];

const E = "var(--map-marker-edge)";

const Foot = ({ banner }: { banner: string }) => <g>
  <ellipse cx=".2" cy=".15" rx="1.3" ry=".45" fill={E} opacity=".35" />
  <path d="M-.45 0 L-.35 -1.2 M.45 0 L.35 -1.2" stroke="var(--map-army-cloth)" strokeWidth=".38" strokeLinecap="round" />
  <path d="M-.7 -1.1 L.7 -1.1 L.55 -2.8 L-.55 -2.8 Z" fill="var(--map-army-metal-dark)" />
  <path d="M-.7 -1.1 L0 -1.1 L0 -2.8 L-.55 -2.8 Z" fill="var(--map-army-metal)" opacity=".55" />
  <path d="M-.55 -2.8 L.55 -2.8 L.45 -2.1 L-.45 -2.1 Z" fill={banner} opacity=".9" />
  <circle cx="0" cy="-3.25" r=".42" fill="var(--map-army-skin)" />
  <path d="M-.5 -3.3 Q0 -4.1 .5 -3.3 Z" fill="var(--map-army-metal)" stroke={E} strokeWidth=".12" />
  <line x1=".75" y1=".1" x2="1.05" y2="-5.4" stroke="var(--map-army-wood)" strokeWidth=".22" strokeLinecap="round" />
  <path d="M1.05 -5.4 L.9 -4.8 L1.2 -4.8 Z" fill="var(--map-army-metal)" />
  <ellipse cx="-.75" cy="-1.9" rx=".55" ry=".95" fill={banner} stroke={E} strokeWidth=".14" />
  <circle cx="-.75" cy="-1.9" r=".18" fill="var(--map-army-metal)" />
</g>;

/** Battle-type figure: same painted soldier with a weapon/gear variant per unit type. */
export type SquadWeapon = "sword" | "spear" | "axe" | "bow" | "sling" | "javelin" | "pick" | "elite" | "militia";
export function weaponOf(type: string | null | undefined): SquadWeapon {
  switch (String(type || "").toUpperCase()) {
    case "SPEARMEN": return "spear"; case "AXEMEN": return "axe"; case "ARCHERS": return "bow"; case "SLINGERS": return "sling";
    case "JAVELINERS": return "javelin"; case "ENGINEERS": return "pick"; case "ELITE_GUARD": return "elite"; case "MILITIA": return "militia";
    default: return "sword";
  }
}
const TypedFoot = ({ banner, weapon }: { banner: string; weapon: SquadWeapon }) => {
  const shield = weapon === "sword" || weapon === "spear" || weapon === "axe" || weapon === "elite" || weapon === "militia";
  const armor = weapon === "elite" ? "var(--map-army-metal)" : weapon === "militia" || weapon === "sling" || weapon === "pick" ? "var(--map-army-cloth)" : "var(--map-army-metal-dark)";
  return <g>
    <ellipse cx=".2" cy=".15" rx="1.3" ry=".45" fill={E} opacity=".35" />
    <path d="M-.45 0 L-.35 -1.2 M.45 0 L.35 -1.2" stroke="var(--map-army-cloth)" strokeWidth=".38" strokeLinecap="round" />
    <path d="M-.7 -1.1 L.7 -1.1 L.55 -2.8 L-.55 -2.8 Z" fill={armor} />
    <path d="M-.55 -2.8 L.55 -2.8 L.45 -2.1 L-.45 -2.1 Z" fill={banner} opacity=".9" />
    <circle cx="0" cy="-3.25" r=".42" fill="var(--map-army-skin)" />
    {weapon !== "sling" && weapon !== "militia" && <path d="M-.5 -3.3 Q0 -4.1 .5 -3.3 Z" fill="var(--map-army-metal)" stroke={E} strokeWidth=".12" />}
    {weapon === "elite" && <path d="M0 -3.9 Q.6 -4.8 .1 -5.2" fill="none" stroke={banner} strokeWidth=".35" strokeLinecap="round" />}
    {weapon === "spear" && <><line x1=".75" y1=".2" x2="1.3" y2="-7" stroke="var(--map-army-wood)" strokeWidth=".24" strokeLinecap="round" /><path d="M1.3 -7 L1.1 -6.2 L1.5 -6.2 Z" fill="var(--map-army-metal)" /></>}
    {(weapon === "sword" || weapon === "elite") && <line x1=".7" y1="-1.4" x2="1.4" y2="-3.6" stroke="var(--map-army-metal)" strokeWidth=".26" strokeLinecap="round" />}
    {weapon === "axe" && <><line x1=".7" y1="-1" x2="1.2" y2="-4.2" stroke="var(--map-army-wood)" strokeWidth=".24" /><path d="M1.15 -4.3 Q2.2 -4 1.9 -3.1 L1.1 -3.5 Z" fill="var(--map-army-metal)" stroke={E} strokeWidth=".1" /></>}
    {weapon === "bow" && <><path d="M.9 -.9 Q2 -2.4 .9 -4" fill="none" stroke="var(--map-army-wood)" strokeWidth=".26" /><line x1=".9" y1="-.9" x2=".9" y2="-4" stroke="var(--map-army-cloth)" strokeWidth=".08" /></>}
    {weapon === "sling" && <path d="M.6 -2.4 Q1.6 -3.8 1.1 -4.6" fill="none" stroke="var(--map-army-wood)" strokeWidth=".16" />}
    {weapon === "javelin" && <><line x1=".5" y1="-1.2" x2="1.6" y2="-5" stroke="var(--map-army-wood)" strokeWidth=".18" /><line x1=".2" y1="-1.2" x2="1.1" y2="-4.6" stroke="var(--map-army-wood)" strokeWidth=".16" /></>}
    {weapon === "pick" && <><line x1=".7" y1="-.6" x2="1" y2="-3.8" stroke="var(--map-army-wood)" strokeWidth=".22" /><path d="M.2 -3.9 Q1 -4.4 1.9 -3.7" fill="none" stroke="var(--map-army-metal)" strokeWidth=".3" /></>}
    {shield && <><ellipse cx="-.75" cy="-1.9" rx={weapon === "spear" || weapon === "elite" ? .7 : .55} ry={weapon === "spear" || weapon === "elite" ? 1.15 : .95} fill={banner} stroke={E} strokeWidth=".14" />
      <circle cx="-.75" cy="-1.9" r=".18" fill="var(--map-army-metal)" /></>}
  </g>;
};

const Horse = ({ banner }: { banner: string }) => <g>
  <ellipse cx="0" cy=".2" rx="2.2" ry=".6" fill={E} opacity=".35" />
  <path d="M-1.4 0 L-1.3 -1.1 M-.8 0 L-.8 -1.1 M.9 0 L.9 -1.1 M1.4 0 L1.3 -1.1" stroke="var(--map-army-wood)" strokeWidth=".3" strokeLinecap="round" />
  <path d="M-1.7 -1 Q-1.8 -2.1 -.6 -2.1 L1 -2.1 L1.8 -3.2 L2.4 -3 L1.9 -1.9 Q1.7 -1 1.4 -1 Z" fill="var(--map-army-wood)" stroke={E} strokeWidth=".14" />
  <path d="M-1.5 -1.3 Q-1.5 -1.9 -.6 -1.9 L.6 -1.9" fill="none" stroke="var(--map-army-cloth)" strokeWidth=".25" opacity=".7" />
  <path d="M-.5 -2 L.5 -2 L.4 -3.4 L-.4 -3.4 Z" fill={banner} stroke={E} strokeWidth=".12" />
  <circle cx="0" cy="-3.8" r=".4" fill="var(--map-army-skin)" />
  <path d="M-.45 -3.85 Q0 -4.6 .45 -3.85 Z" fill="var(--map-army-metal)" />
  <line x1=".4" y1="-2.4" x2="2.6" y2="-5.6" stroke="var(--map-army-wood)" strokeWidth=".2" strokeLinecap="round" />
  <path d="M2.6 -5.6 L2.2 -5.2 L2.5 -5.05 Z" fill="var(--map-army-metal)" />
</g>;

const Siege = ({ banner }: { banner: string }) => <g>
  <ellipse cx="0" cy=".3" rx="2.8" ry=".8" fill={E} opacity=".35" />
  <path d="M-2.4 -.2 L2.2 -.2 L2.6 -1.2 L-2 -1.2 Z" fill="var(--map-army-wood)" stroke={E} strokeWidth=".15" />
  <path d="M-2 -1.2 L2.6 -1.2 L2.2 -1.6 L-2.3 -1.6 Z" fill="var(--map-city-wall-light)" opacity=".5" />
  <circle cx="-1.5" cy="-.1" r=".55" fill="var(--map-army-cloth)" stroke={E} strokeWidth=".12" />
  <circle cx="1.6" cy="-.1" r=".55" fill="var(--map-army-cloth)" stroke={E} strokeWidth=".12" />
  <path d="M-.6 -1.4 L0 -3.4 L.6 -1.4" fill="none" stroke="var(--map-army-wood)" strokeWidth=".3" />
  <line x1="-1.8" y1="-1.5" x2="2" y2="-5" stroke="var(--map-army-wood)" strokeWidth=".38" strokeLinecap="round" />
  <path d="M2 -5 q.9 -.1 .7 .8 q-.8 .1 -.7 -.8 Z" fill="var(--map-army-metal-dark)" />
  <rect x="-2.3" y="-1.9" width=".7" height=".5" fill={banner} />
</g>;

const HeavyHorse = ({ banner }: { banner: string }) => <g><Horse banner={banner} />
  <path d="M-1.6 -1.1 Q-1.7 -2 -.6 -2 L1 -2 L1.5 -1.1 Z" fill="var(--map-army-metal-dark)" opacity=".85" />
  <path d="M-1.6 -1.1 L1.5 -1.1" stroke={banner} strokeWidth=".3" /></g>;

const ArmySquadBase = ({ men, kind, banner, active, formation, unitType }: { men: number; kind: SquadKind; banner: string; active: boolean; formation?: string | null; unitType?: string | null }) => {
  const heavy = String(unitType || "").toUpperCase() === "HEAVY_CAVALRY";
  const weapon = unitType ? weaponOf(unitType) : null;
  const n = squadFigures(men);
  const pts = kind === "siege"
    ? ([[-1, -.2], [1.2, .3]] as Array<[number, number]>).slice(0, Math.ceil(n / 10))
    : [...SOLDIER_SLOTS.slice(0, Math.max(0, n - 2)).map(([x, y]) => ({ x, y, commander: false })),
       ...COMMANDER_SLOTS.slice(0, Math.min(n, 2)).map(([x, y]) => ({ x, y, commander: true }))];
  const sorted = pts.map(p => Array.isArray(p) ? { x: p[0], y: p[1], commander: false } : p).sort((a, b) => a.y - b.y);
  return (
    <g>
      <ellipse cx="0" cy=".4" rx="4.3" ry="2.2" fill="var(--map-army-cloth)" opacity={active ? .3 : .18} />
      {sorted.map(({ x, y, commander }, i) => (
        <g key={i} transform={`translate(${x},${y}) scale(.5)`}>
          {commander && <path d="M-.6 -2.6 L-1.5 -.4 L.3 -1 Z" fill={banner} stroke={E} strokeWidth=".12" />}
          {kind === "horse" ? (heavy ? <HeavyHorse banner={banner} /> : <Horse banner={banner} />) : kind === "siege" ? <Siege banner={banner} /> : weapon ? <TypedFoot banner={banner} weapon={weapon} /> : <Foot banner={banner} />}
        </g>
      ))}
    </g>
  );
};

export const ArmySquad = memo(ArmySquadBase);

/** Army standard planted at the camp centre: pole, banner in realm colour, morale bar. */
const ArmyStandardBase = ({ name, soldiers, unitCount, morale, banner, active }: { name: string; soldiers: number; unitCount: number; morale: number; banner: string; active: boolean }) => {
  const m = Math.max(0, Math.min(100, morale));
  return (
    <g>
      <line x1="0" y1="0" x2="0" y2="-17" stroke="var(--map-marker-edge)" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M0 -17 Q5 -18 9 -16 Q5 -14.5 9 -12.5 Q5 -11 0 -11.5 Z" fill={banner} stroke={active ? "var(--map-focus)" : "var(--map-marker-edge)"} strokeWidth={active ? .9 : .5} />
      <circle cx="0" cy="-17.6" r=".9" fill="var(--map-focus)" />
      <rect x="-7" y="2" width="14" height="2" rx="1" fill="var(--map-marker)" stroke="var(--map-marker-edge)" strokeWidth=".3" />
      <rect x="-7" y="2" width={14 * m / 100} height="2" rx="1" fill={m >= 60 ? banner : "var(--map-focus)"} />
      <title>{`${name} · ${Math.max(0, soldiers).toLocaleString("cs-CZ")} vojáků · ${unitCount} jednotek · morálka ${m}`}</title>
    </g>
  );
};

export const ArmyStandard = memo(ArmyStandardBase);
