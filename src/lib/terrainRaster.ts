/** Rasterises the static terrain (sub-square textures, tints, trees, peaks) into one bitmap,
 * so the map draws a single image instead of tens of thousands of SVG nodes. */
export interface TerrainQuad { pts: [number, number][]; tex?: string; texFilter?: string; tint?: string; tintAlpha?: number }
export interface TerrainSprite {
  href: string; x: number; y: number; w: number; h: number;
  shadow?: { dx: number; dy: number; rx: number; ry: number; color: string; opacity: number };
}
export interface TerrainRasterChunk { url: string; x: number; y: number; w: number; h: number }
export type TerrainRaster = TerrainRasterChunk[];

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

/** Bakes in chunks at high resolution (3 px per map unit) so zooming in stays as sharp as the SVG was. */
export async function rasterizeTerrain(quads: TerrainQuad[], sprites: TerrainSprite[], texWorldSize: number, scale = 3, chunkPx = 2048): Promise<TerrainRaster> {
  if (!quads.length) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
  const qBox = quads.map(q => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; q.pts.forEach(([x, y]) => { grow(x, y); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }); return [x0 - 1, y0 - 1, x1 + 1, y1 + 1]; });
  sprites.forEach(s => { grow(s.x, s.y); grow(s.x + s.w, s.y + s.h); });
  const sorted = [...sprites].sort((a, b) => (a.y + a.h) - (b.y + b.h));
  const hrefs = [...new Set([...quads.map(q => q.tex).filter(Boolean) as string[], ...sprites.map(s => s.href)])];
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(hrefs.map(async href => { try { images.set(href, await loadImage(href)); } catch { /* skip */ } }));
  const chunkWorld = chunkPx / scale;
  const canvas = document.createElement("canvas"); canvas.width = chunkPx; canvas.height = chunkPx;
  const ctx = canvas.getContext("2d"); if (!ctx) return [];
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
        filterCtx.drawImage(img, 0, 0);
        source = filtered;
      }
    }
    const pattern = ctx.createPattern(source, "repeat"); if (!pattern) return;
    pattern.setTransform(new DOMMatrix([1, .5, -1, .5, 0, 0]).scale(texWorldSize / img.width, texWorldSize / img.height));
    patterns.set(href, pattern);
  });
  const out: TerrainRaster = [];
  for (let cy = minY; cy < maxY; cy += chunkWorld) {
    for (let cx = minX; cx < maxX; cx += chunkWorld) {
      const cx1 = cx + chunkWorld, cy1 = cy + chunkWorld;
      const qs = quads.filter((q, i) => { const b = qBox[i]; return b[2] >= cx && b[0] <= cx1 && b[3] >= cy && b[1] <= cy1; });
      const ss = sorted.filter(s => s.x + s.w >= cx && s.x <= cx1 && s.y + s.h >= cy && s.y <= cy1);
      if (!qs.length && !ss.length) continue;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, chunkPx, chunkPx);
      ctx.setTransform(scale, 0, 0, scale, -cx * scale, -cy * scale);
      const path = (q: TerrainQuad) => { ctx.beginPath(); q.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
      ctx.lineWidth = .6; ctx.lineJoin = "round"; ctx.globalAlpha = 1;
      qs.forEach(q => { const pattern = q.tex ? patterns.get(q.tex) : undefined; if (!pattern) return; path(q); ctx.fillStyle = pattern; ctx.strokeStyle = pattern; ctx.fill(); ctx.stroke(); });
      qs.forEach(q => {
        if (!q.tint) return;
        path(q);
        ctx.globalAlpha = q.tintAlpha ?? .3;
        ctx.fillStyle = q.tint;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ss.forEach(s => {
        if (s.shadow) {
          ctx.save();
          ctx.globalAlpha = s.shadow.opacity;
          ctx.fillStyle = canvasColor(s.shadow.color);
          ctx.beginPath();
          ctx.ellipse(s.x + s.w / 2 + s.shadow.dx, s.y + s.h + s.shadow.dy, s.shadow.rx, s.shadow.ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        const img = images.get(s.href);
        if (img) ctx.drawImage(img, s.x, s.y, s.w, s.h);
      });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .92));
      if (blob) out.push({ url: URL.createObjectURL(blob), x: cx, y: cy, w: chunkWorld, h: chunkWorld });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return out;
}
