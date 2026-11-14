/** Rasterises the static terrain (sub-square textures, tints, trees, peaks) into bitmap chunks,
 * so the map draws a handful of images instead of tens of thousands of SVG nodes. */
export interface TerrainQuad {
  pts: [number, number][];
  tex?: string;
  texFilter?: string;
  /** Opaque visual fallback: a missing image must never punch a hole through the world. */
  baseColor?: string;
  tint?: string;
  tintAlpha?: number;
}
export interface TerrainSprite {
  href: string; x: number; y: number; w: number; h: number;
  shadow?: { dx: number; dy: number; rx: number; ry: number; color: string; opacity: number };
}
export interface TerrainRasterChunk { url: string; x: number; y: number; w: number; h: number }
export type TerrainRaster = TerrainRasterChunk[];

type Box = [number, number, number, number];
type IndexedQuad = { quad: TerrainQuad; box: Box };
type ChunkItems = { quads: TerrainQuad[]; sprites: TerrainSprite[] };

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const canvasColorCache = new Map<string, string>();
/** Canvas cannot consume CSS custom properties directly; resolve each semantic token once. */
const canvasColor = (color: string) => {
  if (!color.startsWith("var(")) return color;
  const cached = canvasColorCache.get(color);
  if (cached) return cached;
  const probe = document.createElement("span");
  probe.style.color = color;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  canvasColorCache.set(color, resolved);
  return resolved;
};
const loadImage = (href: string) => {
  let p = imageCache.get(href);
  if (!p) {
    p = new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = href; });
    imageCache.set(href, p);
  }
  return p;
};

/**
 * Bakes in chunks at high resolution (3 px per map unit) so zooming in stays as sharp as the SVG was.
 * Spatial buckets avoid scanning every parcel and sprite for every chunk. The optional signal also
 * releases already-created URLs when a newer terrain snapshot supersedes this one.
 */
export async function rasterizeTerrain(
  quads: TerrainQuad[],
  sprites: TerrainSprite[],
  texWorldSize: number,
  scale = 3,
  chunkPx = 1024,
  signal?: AbortSignal,
): Promise<TerrainRaster> {
  if (!quads.length || signal?.aborted) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
  const indexedQuads: IndexedQuad[] = quads.map(quad => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    quad.pts.forEach(([x, y]) => {
      grow(x, y);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    });
    return { quad, box: [x0 - 1, y0 - 1, x1 + 1, y1 + 1] };
  });
  sprites.forEach(sprite => { grow(sprite.x, sprite.y); grow(sprite.x + sprite.w, sprite.y + sprite.h); });
  const sortedSprites = [...sprites].sort((a, b) => (a.y + a.h) - (b.y + b.h));
  const hrefs = [...new Set([...quads.map(quad => quad.tex).filter(Boolean) as string[], ...sprites.map(sprite => sprite.href)])];
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(hrefs.map(async href => { try { images.set(href, await loadImage(href)); } catch { /* opaque base remains visible */ } }));
  if (signal?.aborted) return [];

  const chunkWorld = chunkPx / scale;
  const buckets = new Map<string, ChunkItems>();
  const bucket = (ix: number, iy: number) => {
    const key = `${ix},${iy}`;
    const existing = buckets.get(key);
    if (existing) return existing;
    const created: ChunkItems = { quads: [], sprites: [] };
    buckets.set(key, created);
    return created;
  };
  const indexesFor = (box: Box, add: (items: ChunkItems) => void) => {
    const x0 = Math.floor(box[0] / chunkWorld), y0 = Math.floor(box[1] / chunkWorld);
    const x1 = Math.floor(box[2] / chunkWorld), y1 = Math.floor(box[3] / chunkWorld);
    for (let iy = y0; iy <= y1; iy += 1) for (let ix = x0; ix <= x1; ix += 1) add(bucket(ix, iy));
  };
  indexedQuads.forEach(({ quad, box }) => indexesFor(box, items => { items.quads.push(quad); }));
  sortedSprites.forEach(sprite => indexesFor([sprite.x, sprite.y, sprite.x + sprite.w, sprite.y + sprite.h], items => { items.sprites.push(sprite); }));

  const canvas = document.createElement("canvas"); canvas.width = chunkPx; canvas.height = chunkPx;
  const ctx = canvas.getContext("2d"); if (!ctx) return [];
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const patterns = new Map<string, CanvasPattern>();
  images.forEach((img, href) => {
    let source: CanvasImageSource = img;
    const filter = quads.find(quad => quad.tex === href && quad.texFilter)?.texFilter;
    if (filter) {
      const filtered = document.createElement("canvas");
      filtered.width = img.width; filtered.height = img.height;
      const filterCtx = filtered.getContext("2d");
      if (filterCtx) {
        filterCtx.filter = filter;
        filterCtx.imageSmoothingEnabled = true;
        filterCtx.imageSmoothingQuality = "high";
        filterCtx.drawImage(img, 0, 0);
        source = filtered;
      }
    }
    const pattern = ctx.createPattern(source, "repeat"); if (!pattern) return;
    pattern.setTransform(new DOMMatrix([1, .5, -1, .5, 0, 0]).scale(texWorldSize / img.width, texWorldSize / img.height));
    patterns.set(href, pattern);
  });

  const out: TerrainRaster = [];
  const release = () => { out.forEach(chunk => URL.revokeObjectURL(chunk.url)); out.length = 0; };
  const path = (quad: TerrainQuad) => {
    ctx.beginPath();
    quad.pts.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  const firstX = Math.floor(minX / chunkWorld), lastX = Math.floor(maxX / chunkWorld);
  const firstY = Math.floor(minY / chunkWorld), lastY = Math.floor(maxY / chunkWorld);
  for (let iy = firstY; iy <= lastY; iy += 1) {
    for (let ix = firstX; ix <= lastX; ix += 1) {
      if (signal?.aborted) { release(); return []; }
      const items = buckets.get(`${ix},${iy}`);
      if (!items) continue;
      const cx = ix * chunkWorld, cy = iy * chunkWorld;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, chunkPx, chunkPx);
      ctx.setTransform(scale, 0, 0, scale, -cx * scale, -cy * scale);
      ctx.lineJoin = "round"; ctx.globalAlpha = 1;

      // Paint an opaque, seam-covering base even if an asset failed. Besides being a visual
      // fallback this closes antialiased hairline gaps between neighbouring micro-parcels.
      ctx.lineWidth = .7;
      items.quads.forEach(quad => {
        if (!quad.baseColor) return;
        const color = canvasColor(quad.baseColor);
        path(quad); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.fill(); ctx.stroke();
      });
      items.quads.forEach(quad => {
        const pattern = quad.tex ? patterns.get(quad.tex) : undefined;
        if (!pattern) return;
        path(quad); ctx.fillStyle = pattern; ctx.fill();
      });
      items.quads.forEach(quad => {
        if (!quad.tint) return;
        path(quad);
        ctx.globalAlpha = quad.tintAlpha ?? .3;
        ctx.fillStyle = canvasColor(quad.tint);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      items.sprites.forEach(sprite => {
        if (sprite.shadow) {
          ctx.save();
          ctx.globalAlpha = sprite.shadow.opacity;
          ctx.fillStyle = canvasColor(sprite.shadow.color);
          ctx.beginPath();
          ctx.ellipse(sprite.x + sprite.w / 2 + sprite.shadow.dx, sprite.y + sprite.h + sprite.shadow.dy, sprite.shadow.rx, sprite.shadow.ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        const img = images.get(sprite.href);
        if (img) ctx.drawImage(img, sprite.x, sprite.y, sprite.w, sprite.h);
      });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .94));
      if (signal?.aborted) { release(); return []; }
      if (blob) out.push({ url: URL.createObjectURL(blob), x: cx, y: cy, w: chunkWorld, h: chunkWorld });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return out;
}
