export type CityWallParcel = { status?: string; claim_kind?: "urban" | "worked" | null };

/** Canonical parcel ownership: claimed/occupied + urban (legacy NULL), never a free worked claim. */
export function walledUrbanParcels<T extends CityWallParcel>(parcels: T[]): T[] {
  return parcels.filter(parcel =>
    (parcel.status === "claimed" || parcel.status === "occupied") && parcel.claim_kind !== "worked");
}
