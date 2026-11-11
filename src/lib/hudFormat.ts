/** HUD number formatting: a real non-zero gain is never rounded to 0. */
export function fmtAmount(n: number): string {
  const a = Math.abs(n);
  if (a === 0) return "0";
  if (a < 0.1) return a < 0.001 ? n.toPrecision(1) : n.toFixed(3);
  if (a < 10) return n.toFixed(1);
  return n.toFixed(0);
}
export const fmtSigned = (n: number) => `${n >= 0 ? "+" : "−"}${fmtAmount(Math.abs(n))}`;

/** Raw-material construction efficiency (mirror of goodsEconomy parcel-mode constants). */
export const RAW_CONSTRUCTION_EFFICIENCY = { raw_timber: 0.2, raw_stone: 0.15 } as const;

export function constructionTooltip(incomePerTurn: number, capacity: number): string {
  const base = `Stavební rezerva = utratitelné body pro stavby (zapisuje je jen konec tahu).\n` +
    `Body vznikají z fyzického přebytku: řezivo/kamenné bloky/stavební materiál (plná účinnost), ` +
    `surové dřevo ${RAW_CONSTRUCTION_EFFICIENCY.raw_timber} b/jedn., surový kámen ${RAW_CONSTRUCTION_EFFICIENCY.raw_stone} b/jedn.\n` +
    `Výrobní kapacita měst ${capacity.toFixed(0)} je jen potenciál, ne příjem.`;
  return incomePerTurn > 0
    ? `${base}\nSkutečný přírůstek: ${fmtSigned(incomePerTurn)}/kolo.`
    : `${base}\nZásoba neroste: žádný přebytek dřeva ani kamene.`;
}
