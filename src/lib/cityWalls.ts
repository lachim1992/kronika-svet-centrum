export type CityWallParcel = { claim_kind?: "urban" | "worked" | null };

/** Only purchased urban plots belong inside the ramparts; worked claims remain open countryside. */
export function walledUrbanParcels<T extends CityWallParcel>(parcels: T[]): T[] {
  return parcels.filter(parcel => parcel.claim_kind !== "worked");
}
