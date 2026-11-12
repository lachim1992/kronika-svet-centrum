/** Rasterises the static terrain (sub-square textures, tints, trees, peaks) into one bitmap,
 * so the map draws a single image instead of tens of thousands of SVG nodes. */
export interface TerrainQuad { pts: [number, number][]; tex?: string; tint?: string }
export interface TerrainSprite { href: string; x: number; y: number; w: number; h: number }
export interface TerrainRaster { url: string; x: number; y: number; w: number; h: number }

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const loadImage = (href: string) => {
  let p = imageCache.get(href);
  if (!p) {
    p = new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = href; });
    imageCache.set(href, p);
  }
  return p;
};

export async function rasterizeTerrain(quads: TerrainQuad[], sprites: TerrainSprite[], texWorldSize: number, maxPx = 7000): Promise<TerrainRaster | null> {
  if (!quads.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
  quads.forEach(q => q.pts.forEach(([x, y]) => grow(x, y)));
  sprites.forEach(s => { grow(s.x, s.y); grow(s.x + s.w, s.y + s.h); });
  const w = maxX - minX, h = maxY - minY;
  const scale = Math.min(2, maxPx / w, maxPx / h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale); canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  const hrefs = [...new Set([...quads.map(q => q.tex).filter(Boolean) as string[], ...sprites.map(s => s.href)])];
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(hrefs.map(async href => { try { images.set(href, await loadImage(href)); } catch { /* skip */ } }));
  ctx.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
  const patterns = new Map<string, CanvasPattern>();
  images.forEach((img, href) => {
    const pattern = ctx.createPattern(img, "repeat"); if (!pattern) return;
    const k = texWorldSize / img.width;
    pattern.setTransform(new DOMMatrix([1, .5, -1, .5, 0, 0]).scale(k, texWorldSize / img.height));
    patterns.set(href, pattern);
  });
  const path = (q: TerrainQuad) => { ctx.beginPath(); q.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  ctx.lineWidth = .6; ctx.lineJoin = "round";
  quads.forEach(q => {
    const pattern = q.tex ? patterns.get(q.tex) : undefined; if (!pattern) return;
    path(q); ctx.fillStyle = pattern; ctx.strokeStyle = pattern; ctx.fill(); ctx.stroke();
  });
  ctx.globalAlpha = .3;
  quads.forEach(q => { if (!q.tint) return; path(q); ctx.fillStyle = q.tint; ctx.fill(); });
  ctx.globalAlpha = 1;
  [...sprites].sort((a, b) => (a.y + a.h) - (b.y + b.h)).forEach(s => { const img = images.get(s.href); if (img) ctx.drawImage(img, s.x, s.y, s.w, s.h); });
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .9));
  if (!blob) return null;
  return { url: URL.createObjectURL(blob), x: minX, y: minY, w, h };
}
