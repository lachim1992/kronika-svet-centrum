import { POPULATION_PER_SLOT } from "@/lib/tileParcels";
import type { ParcelActual } from "@/lib/parcelActual";

export type ParcelBenefit = {
  kind: "housing" | "yield";
  value: number;
  label: string;
  detail: string;
};

/** Display only canonical land capacity or the largest committed parcel output; never mix goods together. */
export function parcelBenefit(
  parcel: { capacity_slots: number; claim_kind?: "urban" | "worked" | null },
  actual: ParcelActual[] | undefined,
): ParcelBenefit {
  if (parcel.claim_kind === "worked") {
    const primary = [...(actual || [])].sort((a, b) => b.realized - a.realized)[0];
    const value = primary?.realized || 0;
    return {
      kind: "yield",
      value,
      label: `+${value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })}`,
      detail: primary ? `${primary.good} / tah${actual && actual.length > 1 ? ` · další výnosy v detailu` : ""}` : "žádný výnos v posledním uzavřeném tahu",
    };
  }
  const value = Math.max(0, Number(parcel.capacity_slots) || 0) * POPULATION_PER_SLOT;
  return { kind: "housing", value, label: `+${value.toLocaleString("cs-CZ")}`, detail: "míst k bydlení" };
}
