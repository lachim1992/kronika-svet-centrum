import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { FBEvent, FBUnit } from "../../../supabase/functions/_shared/fieldBattle";

type Point = { x: number; y: number };
export type BattleEffectTiming = {
  delay: number;
  duration: number;
  launchDelay: number;
  impactDelay: number;
  arrowFlight: number;
};
type Effect = {
  id: string;
  key: string;
  kind: string;
  from: Point;
  to: Point;
  timing: BattleEffectTiming;
};

const RANGED = new Set(["shoot", "volley"]);
const PROJECTILES: Record<string, number> = { shoot: 3, volley: 7 };
const ARROW_FLIGHT = 1.8;
const ARROW_STAGGER = .1;
const DRAW_TIME = .65;
const IMPACT_TIME = .85;
const SCENE_GAP = .35;

/** Each committed attack gets its own scene; the next starts only after the previous impact fades. */
export function battleEffectSchedule(kinds: string[]): BattleEffectTiming[] {
  let cursor = 0;
  return kinds.map(kind => {
    const ranged = RANGED.has(kind);
    const projectileCount = PROJECTILES[kind] ?? 0;
    const launchOffset = ranged ? DRAW_TIME : 0;
    const impactOffset = ranged
      ? launchOffset + ARROW_FLIGHT + Math.max(0, projectileCount - 1) * ARROW_STAGGER
      : .95;
    const duration = Math.max(ranged ? 0 : 1.45, impactOffset + IMPACT_TIME);
    const timing = {
      delay: cursor,
      duration,
      launchDelay: cursor + launchOffset,
      impactDelay: cursor + impactOffset,
      arrowFlight: ARROW_FLIGHT,
    };
    cursor += duration + SCENE_GAP;
    return timing;
  });
}

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
    const hits = events
      .filter(e => e.target && ["attack", "charge", "shoot", "volley"].includes(e.kind))
      .sort((a, b) => a.seq - b.seq);
    const schedule = battleEffectSchedule(hits.map(hit => hit.kind));
    setEffects(hits.flatMap((event, index) => {
      const from = pointOf(event.key), to = event.target ? pointOf(event.target) : null;
      return from && to ? [{
        id: `${battleId}:${round}:${event.seq}:${event.key}`,
        key: event.key,
        kind: event.kind,
        from,
        to,
        timing: schedule[index],
      }] : [];
    }));
    const last = schedule[schedule.length - 1];
    const timer = window.setTimeout(() => setEffects([]), last ? (last.delay + last.duration) * 1000 + 100 : 0);
    return () => window.clearTimeout(timer);
    // project is a render-local coordinate helper; round changes alone trigger playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId, round]);
  return <g data-battle-attack-effects pointerEvents="none">
    {effects.map(effect => {
      const ranged = RANGED.has(effect.kind);
      const dx = effect.to.x - effect.from.x, dy = effect.to.y - effect.from.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const { timing } = effect;
      return <g key={effect.id} data-battle-effect={effect.kind}>
        <g transform={`translate(${effect.from.x},${effect.from.y})`}>
          <g className={ranged ? "iso-battle-draw" : "iso-battle-strike"} style={{
            "--strike-x": `${dx * .28}px`,
            "--strike-y": `${dy * .28}px`,
            animationDelay: `${timing.delay}s`,
          } as CSSProperties}>
            {ranged ? <path d="M-1 -4 Q3 -2 -1 0 M-1 -4 L-1 0 M-1 -2 L2 -2" fill="none" stroke="var(--map-army-wood)" strokeWidth=".65" />
              : <path d="M-2 1 L2 -4 M1 -3 L3 -1 M-3 2 L-1 4" fill="none" stroke="var(--map-army-metal)" strokeWidth=".9" />}
          </g>
        </g>
        {ranged && Array.from({ length: PROJECTILES[effect.kind] }, (_, index) => {
          const offset = (index - (PROJECTILES[effect.kind] - 1) / 2) * .65;
          return <g key={index} transform={`translate(${effect.from.x},${effect.from.y - 2 + offset})`}>
            <g className="iso-battle-arrow" style={{
              "--arrow-x": `${dx}px`,
              "--arrow-y": `${dy}px`,
              "--arrow-duration": `${timing.arrowFlight}s`,
              animationDelay: `${timing.launchDelay + index * ARROW_STAGGER}s`,
            } as CSSProperties}>
              <g transform={`rotate(${angle})`}>
                <path d="M-10 0 L-4 0" fill="none" stroke="var(--map-focus)" strokeWidth=".45" opacity=".45" />
                <path d="M-4 0 L0 0 M-1.5 -1 L0 0 L-1.5 1" fill="none" stroke="var(--map-label)" strokeWidth=".6" />
                <path d="M-4 0 L-5 -.7 M-4 0 L-5 .7" stroke="var(--map-army-wood)" strokeWidth=".45" />
              </g>
            </g>
          </g>;
        })}
        <g transform={`translate(${effect.to.x},${effect.to.y})`}>
          <circle className="iso-battle-impact-ring" style={{ animationDelay: `${timing.impactDelay}s` }} r="3" fill="none" stroke="var(--map-focus)" strokeWidth=".7" />
          <path className="iso-battle-impact" style={{ animationDelay: `${timing.impactDelay}s` }} d="M-3 -3 L3 3 M3 -3 L-3 3 M0 -4 L0 4" fill="none" stroke="var(--map-focus)" strokeWidth=".8" />
        </g>
      </g>;
    })}
  </g>;
}
