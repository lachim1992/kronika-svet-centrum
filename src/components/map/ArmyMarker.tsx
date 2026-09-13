import { memo } from "react";

export type ArmyGlyph = {
  id: string;
  name: string;
  soldiers: number;
  morale: number;
  unit_count: number;
  stance: string;
  formation_type: string;
};

/** Static isometric war-band illustration: base plate, spear rows, shields, banner. No animation. */
const ArmyMarkerBase = ({ army, own, active }: { army: ArmyGlyph; own: boolean; active: boolean }) => {
  const banner = own ? "var(--map-city-own)" : "var(--map-city-rival)";
  const soldiers = Math.max(0, army.soldiers);
  const tier = soldiers >= 4000 ? 3 : soldiers >= 1200 ? 2 : 1;
  const files = tier === 3 ? 5 : tier === 3 - 1 ? 4 : 3;
  const rows = tier === 3 ? 2 : 1;
  const morale = Math.max(0, Math.min(100, army.morale));

  const figures: { x: number; y: number }[] = [];
  for (let row = 0; row < rows; row += 1) {
    const count = row === 0 ? files : files - 1;
    for (let index = 0; index < count; index += 1) {
      figures.push({ x: (index - (count - 1) / 2) * 7.5, y: -row * 6 });
    }
  }

  return (
    <g>
      {/* ground plate */}
      <polygon points="-21,2 0,12 21,2 0,-8" fill="var(--map-city-base)" stroke="var(--map-marker-edge)" strokeWidth={active ? 1.8 : 1} opacity=".92" />
      <polygon points="-21,2 0,12 21,2 0,-8" fill="none" stroke={active ? "var(--map-focus)" : banner} strokeWidth={active ? 2 : 1.1} />

      {/* spear rows behind the figures */}
      {figures.map((figure, index) => (
        <line key={`spear-${index}`} x1={figure.x + 2.4} y1={figure.y + 1} x2={figure.x + 4.6} y2={figure.y - 15}
          stroke="var(--map-marker-edge)" strokeWidth=".9" strokeLinecap="round" />
      ))}

      {/* soldier figures */}
      {figures.map((figure, index) => (
        <g key={figure.x + "-" + figure.y + "-" + index} transform={`translate(${figure.x},${figure.y})`}>
          <path d="M-2.4 1 L2.4 1 L1.8 -5 L-1.8 -5 Z" fill="var(--map-city-wall-dark)" stroke="var(--map-marker-edge)" strokeWidth=".5" />
          <path d="M-2.6 -5 Q0 -9 2.6 -5 Z" fill="var(--map-city-wall-light)" stroke="var(--map-marker-edge)" strokeWidth=".5" />
          <path d="M-4.4 -4.4 L-1.4 -3.4 L-1.4 .6 L-4.4 -0.4 Z" fill={banner} stroke="var(--map-marker-edge)" strokeWidth=".45" />
        </g>
      ))}

      {/* standard */}
      <line x1="-13" y1="1" x2="-13" y2="-24" stroke="var(--map-marker-edge)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M-13 -24 L-1 -21 L-13 -16 Z" fill={banner} stroke="var(--map-marker-edge)" strokeWidth=".7" />
      {tier === 3 && <path d="M-13 -15 L-3 -12.5 L-13 -8.5 Z" fill={banner} stroke="var(--map-marker-edge)" strokeWidth=".6" opacity=".8" />}

      {/* morale bar */}
      <rect x="-11" y="6" width="22" height="2.6" rx="1.3" fill="var(--map-marker)" stroke="var(--map-marker-edge)" strokeWidth=".4" />
      <rect x="-11" y="6" width={22 * morale / 100} height="2.6" rx="1.3" fill={morale >= 60 ? banner : "var(--map-focus)"} />

      <title>{`${army.name} · ${soldiers.toLocaleString("cs-CZ")} vojáků · ${army.unit_count} jednotek · morálka ${morale}`}</title>
    </g>
  );
};

export const ArmyMarker = memo(ArmyMarkerBase);
export default ArmyMarker;
