/**
 * Role-based permission system.
 * ADMIN = game creator / moderator
 * PLAYER = regular participant
 */

export type GameRole = "admin" | "player";

export interface Permissions {
  canCreateCityGlobal: boolean;
  canCreateSettlement: boolean;
  canEditCityStatus: boolean;
  canRunServerDevTools: boolean;
  canRunLocalSimulation: boolean;
  canEditCityLevel: boolean;
  canUpgradeSettlement: boolean;
}

export function getPermissions(role: string): Permissions {
  const isAdmin = role === "admin";
  return {
    canCreateCityGlobal: isAdmin,
    canCreateSettlement: true, // all players can create settlements in their province
    canEditCityStatus: isAdmin,
    canRunServerDevTools: isAdmin,
    canRunLocalSimulation: true,
    canEditCityLevel: isAdmin,
    canUpgradeSettlement: true, // gated by requirements, not role
  };
}
