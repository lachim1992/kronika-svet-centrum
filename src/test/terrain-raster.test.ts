import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rasterizeTerrain } from "@/lib/terrainRaster";

const quad = (x: number, y: number) => ({
  pts: [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]] as [number, number][],
  tex: "missing-texture",
  baseColor: "rgb(12, 34, 56)",
});

describe("terrain raster safety", () => {
  let fills: Array<{ style: unknown; alpha: number }>;
  let urls: number;
  let created: string[];
  let revoked: string[];
  let blobCalls: number;
  let onSecondBlob: (() => void) | undefined;

  beforeEach(() => {
    fills = []; urls = 0; created = []; revoked = []; blobCalls = 0; onSecondBlob = undefined;
    const context: any = {
      globalAlpha: 1,
      fillStyle: "",
      strokeStyle: "",
      beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), ellipse: vi.fn(),
      fill: vi.fn(() => fills.push({ style: context.fillStyle, alpha: context.globalAlpha })),
      stroke: vi.fn(), drawImage: vi.fn(), createPattern: vi.fn(() => null),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback: BlobCallback) {
      blobCalls += 1;
      if (blobCalls === 2) onSecondBlob?.();
      callback(new Blob(["raster"], { type: "image/webp" }));
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => {
      const url = `blob:raster-${++urls}`; created.push(url); return url;
    }) });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn((url: string) => { revoked.push(url); }) });
    class MissingImage {
      width = 8; height = 8; onload: (() => void) | null = null; onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal("Image", MissingImage);
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("paints an opaque base instead of leaving a hole when a texture is unavailable", async () => {
    const raster = await rasterizeTerrain([quad(0, 0)], [], 10, 1, 64);
    expect(raster).toHaveLength(1);
    expect(fills[0]).toEqual({ style: "rgb(12, 34, 56)", alpha: 1 });
  });

  it("revokes every already-created chunk URL when a newer run cancels this one", async () => {
    const controller = new AbortController();
    onSecondBlob = () => controller.abort();
    const raster = await rasterizeTerrain([quad(0, 0), quad(500, 500)], [], 10, 1, 64, controller.signal);
    expect(raster).toEqual([]);
    expect(created).toEqual(["blob:raster-1"]);
    expect(revoked).toEqual(["blob:raster-1"]);
  });
});
