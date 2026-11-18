import { describe, expect, it } from "vitest";
import { battleEffectSchedule } from "@/components/map/BattleAttackEffects";

describe("battle attack playback", () => {
  it("plays every attack as a separate scene after the previous impact", () => {
    const scenes = battleEffectSchedule(["attack", "shoot", "charge", "volley"]);

    expect(scenes[0].delay).toBe(0);
    for (let index = 1; index < scenes.length; index += 1) {
      const previous = scenes[index - 1];
      expect(scenes[index].delay).toBeGreaterThanOrEqual(previous.delay + previous.duration);
    }
    expect(scenes[1].launchDelay).toBeGreaterThan(scenes[1].delay);
    expect(scenes[1].impactDelay).toBeGreaterThan(scenes[1].launchDelay + scenes[1].arrowFlight);
  });

  it("waits for the whole seven-arrow volley before starting the next attack", () => {
    const [volley, melee] = battleEffectSchedule(["volley", "attack"]);

    expect(volley.impactDelay).toBeCloseTo(volley.launchDelay + volley.arrowFlight + .6);
    expect(melee.delay).toBeGreaterThan(volley.impactDelay);
  });

  it("separates preparation, action and impact and leaves a clear pause between scenes", () => {
    const [shot, next] = battleEffectSchedule(["shoot", "attack"]);

    expect(shot.launchDelay - shot.delay).toBeCloseTo(.9);
    expect(shot.impactDelay).toBeCloseTo(shot.launchDelay + shot.arrowFlight + .2);
    expect(shot.duration - (shot.impactDelay - shot.delay)).toBeCloseTo(.85);
    expect(next.delay - (shot.delay + shot.duration)).toBeCloseTo(.55);
  });
});
