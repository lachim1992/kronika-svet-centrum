import { describe, expect, it } from "vitest";
import { mapCameraTransform, pinchMapCameraAt, zoomMapCameraAt } from "@/lib/mapCamera";

const screenPoint = (camera: { zoom: number; pan: { x: number; y: number } }, world: { x: number; y: number }) => ({
  x: camera.zoom * (world.x + camera.pan.x),
  y: camera.zoom * (world.y + camera.pan.y),
});

describe("map camera", () => {
  it("keeps the wheel anchor on the same world point", () => {
    const camera = { zoom: 1.4, pan: { x: 20, y: -8 } };
    const anchor = { x: 410, y: 260 };
    const world = { x: anchor.x / camera.zoom - camera.pan.x, y: anchor.y / camera.zoom - camera.pan.y };
    const zoomed = zoomMapCameraAt(camera, 2.1, anchor);
    expect(screenPoint(zoomed, world).x).toBeCloseTo(anchor.x, 8);
    expect(screenPoint(zoomed, world).y).toBeCloseTo(anchor.y, 8);
  });

  it("preserves pinch anchoring while the finger midpoint moves", () => {
    const start = { zoom: 1.2, pan: { x: -15, y: 30 } };
    const startCenter = { x: 300, y: 400 };
    const currentCenter = { x: 345, y: 375 };
    const world = { x: startCenter.x / start.zoom - start.pan.x, y: startCenter.y / start.zoom - start.pan.y };
    const pinched = pinchMapCameraAt(start, startCenter, 2.4, currentCenter);
    expect(screenPoint(pinched, world).x).toBeCloseTo(currentCenter.x, 8);
    expect(screenPoint(pinched, world).y).toBeCloseTo(currentCenter.y, 8);
  });

  it("uses one parent transform with unmodified world coordinates", () => {
    expect(mapCameraTransform({ zoom: 2, pan: { x: 10, y: -4 } })).toBe("translate(20 -8) scale(2)");
  });
});
