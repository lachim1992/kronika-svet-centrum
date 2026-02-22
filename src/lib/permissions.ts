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
    canCreateSettlement: true,
    canEditCityStatus: isAdmin,
    canRunServerDevTools: isAdmin,
    canRunLocalSimulation: true,
    canEditCityLevel: isAdmin,
    canUpgradeSettlement: true,
  };
}

/**
 * Check if premium features are allowed for this user/session.
 * Returns true when:
 * - user has admin role, OR
 * - devMode is enabled in server_config
 * This bypasses all premium gates for dev/admin users.
 */
export function isPremiumAllowed(role: string, devMode?: boolean): boolean {
  if (role === "admin") return true;
  if (devMode) return true;
  return false;
}
