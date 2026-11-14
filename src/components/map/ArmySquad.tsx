import { memo } from "react";

export type SquadKind = "foot" | "horse" | "siege";

export function squadKind(formation: string | null | undefined): SquadKind {
  const f = (formation || "").toLowerCase();
  if (/cav|horse|jízd|jizd|rider|mounted/.test(f)) return "horse";
  if (/siege|oblé|oble|catap|ram/.test(f)) return "siege";
  return "foot";
}

/** Figures shown on one sub-square: one painted soldier per ~125 men, 1..4. */
export function squadFigures(men: number): number {
  return Math.max(1, Math.min(4, Math.ceil(Math.max(0, men) / 125)));
}

const SLOTS = [[0, 0], [-2.6, -1.3], [2.6, -1.3], [0, -2.6]] as const;

/** Painted war-band on a single 6x6 sub-square (centre at 0,0; sub-square is ~14x7 px). Static, no animation. */
const ArmySquadBase = ({ men, kind, banner, active }: { men: number; kind: SquadKind; banner: string; active: boolean }) => {
  const n = squadFigures(men);
  const slots = SLOTS.slice(0, n).slice().sort((a, b) => a[1] - b[1]);
  return (
    <g>
      {/* trampled ground and shadow */}
      <ellipse cx="0" cy=".6" rx="6.2" ry="2.8" fill="var(--map-marker-edge)" opacity={active ? .34 : .24} />
      {slots.map(([x, y], i) => (
        <g key={i} transform={`translate(${x},${y})`}>
          {kind === "horse" ? <>
            <path d="M-2.6 0 L-2.2 -1.6 Q0 -2.6 2.4 -1.8 L3 -2.8 L3.6 -2.4 L2.8 -1 L2.6 0" fill="var(--map-city-wall-dark)" stroke="var(--map-marker-edge)" strokeWidth=".35" />
            <path d="M-.6 -1.9 L.6 -1.9 L.4 -4 L-.4 -4 Z" fill={banner} stroke="var(--map-marker-edge)" strokeWidth=".3" />
            <circle cx="0" cy="-4.5" r=".7" fill="var(--map-city-wall-light)" stroke="var(--map-marker-edge)" strokeWidth=".25" />
            <line x1=".6" y1="-3.6" x2="3.4" y2="-6" stroke="var(--map-marker-edge)" strokeWidth=".35" strokeLinecap="round" />
          </> : kind === "siege" ? <>
            <path d="M-2.4 0 L2.4 0 L2 -1.4 L-2 -1.4 Z" fill="var(--map-city-wall-dark)" stroke="var(--map-marker-edge)" strokeWidth=".35" />
            <line x1="-1.6" y1="-1.4" x2="1.8" y2="-5" stroke="var(--map-marker-edge)" strokeWidth=".6" strokeLinecap="round" />
            <circle cx="1.8" cy="-5" r=".7" fill={banner} stroke="var(--map-marker-edge)" strokeWidth=".25" />
          </> : <>
            <line x1=".9" y1=".2" x2="1.6" y2="-6.2" stroke="var(--map-marker-edge)" strokeWidth=".35" strokeLinecap="round" />
            <path d="M-.9 0 L.9 0 L.7 -2.6 L-.7 -2.6 Z" fill="var(--map-city-wall-dark)" stroke="var(--map-marker-edge)" strokeWidth=".3" />
            <circle cx="0" cy="-3.2" r=".75" fill="var(--map-city-wall-light)" stroke="var(--map-marker-edge)" strokeWidth=".25" />
            <path d="M-1.8 -2.4 L-.5 -2 L-.5 -.3 L-1.8 -.7 Z" fill={banner} stroke="var(--map-marker-edge)" strokeWidth=".3" />
          </>}
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
