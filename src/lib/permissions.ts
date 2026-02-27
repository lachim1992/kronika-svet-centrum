/**
 * Role-based permission system.
 * ADMIN = game creator
 * MODERATOR = global moderator (same powers as admin, no dev tools)
 * PLAYER = regular participant
 */

export type GameRole = "admin" | "moderator" | "player";

export interface Permissions {
  canCreateCityGlobal: boolean;
  canCreateSettlement: boolean;
  canEditCityStatus: boolean;
  canRunServerDevTools: boolean;
  canRunLocalSimulation: boolean;
  canEditCityLevel: boolean;
  canUpgradeSettlement: boolean;
  canGenerateForOthers: boolean;
  canModeratePlayers: boolean;
  canManageContent: boolean;
}

/** Returns true when the role grants elevated (admin-like) privileges */
export function isElevatedRole(role: string): boolean {
  return role === "admin" || role === "moderator";
}

export function getPermissions(role: string): Permissions {
  const elevated = isElevatedRole(role);
  const isAdmin = role === "admin";
  return {
    canCreateCityGlobal: elevated,
    canCreateSettlement: true,
    canEditCityStatus: elevated,
    canRunServerDevTools: isAdmin, // moderator does NOT get dev tools
    canRunLocalSimulation: true,
    canEditCityLevel: elevated,
    canUpgradeSettlement: true,
    canGenerateForOthers: elevated,
    canModeratePlayers: elevated,
    canManageContent: elevated,
  };
}

/**
 * Check if premium features are allowed for this user/session.
 */
export function isPremiumAllowed(role: string, devMode?: boolean): boolean {
  if (isElevatedRole(role)) return true;
  if (devMode) return true;
  return false;
}
