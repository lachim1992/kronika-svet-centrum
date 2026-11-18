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
});
