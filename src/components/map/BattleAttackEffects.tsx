import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { FBEvent, FBUnit } from "../../../supabase/functions/_shared/fieldBattle";

type Point = { x: number; y: number };
type Effect = { id: string; key: string; kind: string; from: Point; to: Point; delay: number };

/** Cosmetic playback of newly committed combat events, never queued or invented attacks. */
export default function BattleAttackEffects({ battleId, round, events, units, project }: {
  battleId: string; round: number; events: FBEvent[]; units: FBUnit[]; project: (x: number, y: number) => Point;
}) {
  const previous = useRef<{ id: string; round: number; units: FBUnit[] } | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  useEffect(() => {
    const old = previous.current;
    previous.current = { id: battleId, round, units };
    if (!old || old.id !== battleId || old.round === round) return;
    const pointOf = (key: string) => {
      const u = units.find(u => u.key === key && u.x !== null && u.y !== null)
        ?? old.units.find(u => u.key === key && u.x !== null && u.y !== null);
      return u && u.x !== null && u.y !== null ? project(u.x, u.y) : null;
    };
    const hits = events.filter(e => e.target && ["attack", "charge", "shoot", "volley"].includes(e.kind));
    setEffects(hits.flatMap((e, i) => {
      const from = pointOf(e.key), to = e.target ? pointOf(e.target) : null;
      return from && to ? [{ id: `${battleId}:${round}:${e.seq}:${e.key}`, key: e.key, kind: e.kind, from, to, delay: i * .08 }] : [];
    }));
    const timer = window.setTimeout(() => setEffects([]), 1800 + hits.length * 80);
    return () => window.clearTimeout(timer);
    // project is a render-local coordinate helper; round changes alone trigger playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId, round]);
  return <g data-battle-attack-effects pointerEvents="none">
    {effects.map(e => {
      const ranged = e.kind === "shoot" || e.kind === "volley";
      const dx = e.to.x - e.from.x, dy = e.to.y - e.from.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      return <g key={e.id}>
        <g transform={`translate(${e.from.x},${e.from.y})`}>
          <g className="iso-battle-strike" style={{ "--strike-x": `${dx * (ranged ? .03 : .25)}px`, "--strike-y": `${dy * (ranged ? .03 : .25)}px`, animationDelay: `${e.delay}s` } as CSSProperties}>
            {ranged ? <path d="M-1 -4 Q3 -2 -1 0 M-1 -4 L-1 0" fill="none" stroke="var(--map-army-wood)" strokeWidth=".6" />
              : <path d="M-2 1 L2 -4 M1 -3 L3 -1" fill="none" stroke="var(--map-army-metal)" strokeWidth=".8" />}
          </g>
        </g>
        {ranged && Array.from({ length: e.kind === "volley" ? 7 : 3 }, (_, i) => {
          const offset = (i - (e.kind === "volley" ? 3 : 1)) * .65;
          return <g key={i} transform={`translate(${e.from.x},${e.from.y - 2 + offset})`}>
            <g className="iso-battle-arrow" style={{ "--arrow-x": `${dx}px`, "--arrow-y": `${dy}px`, animationDelay: `${e.delay + i * .04}s` } as CSSProperties}>
              <g transform={`rotate(${angle})`}><path d="M-4 0 L0 0 M-1.5 -1 L0 0 L-1.5 1" fill="none" stroke="var(--map-label)" strokeWidth=".45" /><path d="M-4 0 L-5 -.7 M-4 0 L-5 .7" stroke="var(--map-army-wood)" strokeWidth=".4" /></g>
            </g>
          </g>;
        })}
        <g transform={`translate(${e.to.x},${e.to.y})`}><path className="iso-battle-impact" style={{ animationDelay: `${e.delay + (ranged ? .65 : .2)}s` }} d="M-3 -3 L3 3 M3 -3 L-3 3 M0 -4 L0 4" fill="none" stroke="var(--map-focus)" strokeWidth=".7" /></g>
      </g>;
    })}
  </g>;
}