/**
 * Role-based permission system.
 * ADMIN = game creator / moderator
 * PLAYER = regular participant
 */

export type GameRole = "admin" | "player";

export interface Permissions {
  canCreateCityGlobal: boolean;
  canEditCityStatus: boolean;
  canRunServerDevTools: boolean;
  canRunLocalSimulation: boolean;
  canEditCityLevel: boolean;
}

export function getPermissions(role: string): Permissions {
  const isAdmin = role === "admin";
  return {
    canCreateCityGlobal: isAdmin,
    canEditCityStatus: isAdmin,
    canRunServerDevTools: isAdmin,
    canRunLocalSimulation: true, // both admin and player
    canEditCityLevel: isAdmin,
  };
}
