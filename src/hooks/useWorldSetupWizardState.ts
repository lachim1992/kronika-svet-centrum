// useWorldSetupWizardState — Inkrement 3 v9
//
// Premise-first wizard state machine.
//
// Design invariants:
//  - `resolved` is NOT in state. Always derived from (aiSuggestion, userOverrides).
//  - There is NO `analyzing` boolean. Busy is derived from active request IDs.
//  - Every async action carries a `requestId`. Late responses are discarded
//    (G2 stale response guard).
//  - REGENERATE_BLUEPRINT_FAIL clears active request ID without resetting
//    isBlueprintStale → create stays blocked, regen button re-enabled.
//  - During isBusy, the editor is frozen (G5) — UI must respect this.
//  - lockedPaths is canonicalized (leaf-only, no parent paths, no dups).
//
// Acceptance covered: 1–26 (see .lovable/plan.md).

import { useCallback, useMemo, useReducer } from "react";
import {
  ADVANCED_MANAGED_PATHS,
  canonicalizeLocks,
  deepMerge,
  isLockable,
  isTerrainDependentPath,
  resolveSpec,
  setByPath,
  unsetByPath,
} from "@/lib/worldgenSpecPaths";
import type { DeepPartial, WorldgenSpecV1 } from "@/types/worldBootstrap";

// ─── State shape ─────────────────────────────────────────────────────────────

export interface WizardState {
  // Input
  premise: string;
  /** Premisa Pradávna — svět PŘED Zlomem. Volitelné; když prázdné, AI ji navrhne. */
  preWorldPremise: string;
  /** Návrh Pradávna od AI, dokud ho hráč nezedituje/nepotvrdí. */
  preWorldSuggested: boolean;
  inspirationUsed: string | null;

  // AI návrh + user vrstva
  aiSuggestion: WorldgenSpecV1 | null;
  userOverrides: DeepPartial<WorldgenSpecV1>;
  lockedPaths: string[];
  advancedLockedPaths: string[];

  // Stale tracking
  isSuggestionStale: boolean;
  isBlueprintStale: boolean;
  lastAnalyzedPremise: string | null;
  regenerationNonce: number;

  // Request lifecycle (G2 + G3)
  activeAnalyzeRequestId: string | null;
  activeBlueprintRegenRequestId: string | null;

  // Errors (G4)
  analyzeError: string | null;
  blueprintRegenError: string | null;

  // Warnings from last analyze/regen (display-only)
  warnings: Array<{ code: string; message: string; field?: string }>;
}

const initialState: WizardState = {
  premise: "",
  preWorldPremise: "",
  preWorldSuggested: false,
  inspirationUsed: null,
  aiSuggestion: null,
  userOverrides: {},
  lockedPaths: [],
  advancedLockedPaths: [],
  isSuggestionStale: false,
  isBlueprintStale: false,
  lastAnalyzedPremise: null,
  regenerationNonce: 0,
  activeAnalyzeRequestId: null,
  activeBlueprintRegenRequestId: null,
  analyzeError: null,
  blueprintRegenError: null,
  warnings: [],
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export type WizardAction =
  | { type: "SET_PREMISE"; premise: string }
  | { type: "SET_PRE_WORLD"; preWorldPremise: string; suggested?: boolean }
  | { type: "USE_INSPIRATION"; premise: string; label: string }
  | { type: "EDIT_FIELD"; path: string; value: unknown }
  | { type: "RESET_FIELD"; path: string }
  | { type: "LOCK_FIELD"; path: string }
  | { type: "UNLOCK_FIELD"; path: string }
  | { type: "ADVANCED_TOGGLE"; enabled: boolean; currentValues: Record<string, unknown> }
  | { type: "ANALYZE_START"; requestId: string; premiseSnapshot: string }
  | {
      type: "ANALYZE_SUCCESS";
      requestId: string;
      premiseSnapshot: string;
      spec: WorldgenSpecV1;
      warnings: Array<{ code: string; message: string; field?: string }>;
    }
  | { type: "ANALYZE_FAIL"; requestId: string; error: string }
  | { type: "REGENERATE_BLUEPRINT_START"; requestId: string; nonce: number }
  | {
      type: "REGENERATE_BLUEPRINT_SUCCESS";
      requestId: string;
      spec: WorldgenSpecV1;
      warnings: Array<{ code: string; message: string; field?: string }>;
    }
  | { type: "REGENERATE_BLUEPRINT_FAIL"; requestId: string; error: string }
  | { type: "RESET" };

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_PREMISE": {
      const premise = action.premise;
      const stale = state.lastAnalyzedPremise !== null && premise !== state.lastAnalyzedPremise;
      return {
        ...state,
        premise,
        isSuggestionStale: stale ? true : state.isSuggestionStale,
      };
    }

    case "SET_PRE_WORLD": {
      return {
        ...state,
        preWorldPremise: action.preWorldPremise,
        preWorldSuggested: action.suggested ?? false,
        // Změna Pradávna invaliduje ancient layer → spec je nutné přegenerovat.
        isSuggestionStale: state.lastAnalyzedPremise !== null ? true : state.isSuggestionStale,
      };
    }

    case "USE_INSPIRATION": {
      const stale = state.lastAnalyzedPremise !== null && action.premise !== state.lastAnalyzedPremise;
      return {
        ...state,
        premise: action.premise,
        inspirationUsed: action.label,
        isSuggestionStale: stale ? true : state.isSuggestionStale,
      };
    }

    case "EDIT_FIELD": {
      // Whitelist guard — no-op for non-lockable parent paths.
      if (!isLockable(action.path)) {
        // Allow edits to terrain.biomeWeights as a leaf even though it's not
        // in LOCKABLE_LEAF_PATHS (locked only as part of advanced or regen).
        if (action.path !== "terrain.biomeWeights") {
          return state;
        }
      }
      const nextOverrides = setByPath(
        state.userOverrides as object,
        action.path,
        action.value,
      ) as DeepPartial<WorldgenSpecV1>;
      const stale = isTerrainDependentPath(action.path);
      return {
        ...state,
        userOverrides: nextOverrides,
        isBlueprintStale: stale ? true : state.isBlueprintStale,
      };
    }

    case "RESET_FIELD": {
      const nextOverrides = unsetByPath(
        state.userOverrides as object,
        action.path,
      ) as DeepPartial<WorldgenSpecV1>;
      const stale = isTerrainDependentPath(action.path);
      return {
        ...state,
        userOverrides: nextOverrides,
        isBlueprintStale: stale ? true : state.isBlueprintStale,
      };
    }

    case "LOCK_FIELD": {
      if (!isLockable(action.path)) return state;
      if (state.lockedPaths.includes(action.path)) return state;
      const next = canonicalizeLocks([...state.lockedPaths, action.path]);
      return { ...state, lockedPaths: next };
    }

    case "UNLOCK_FIELD": {
      if (!state.lockedPaths.includes(action.path)) return state;
      const next = state.lockedPaths.filter((p) => p !== action.path);
      // Also drop from advancedLockedPaths if present (manual unlock wins).
      const nextAdv = state.advancedLockedPaths.filter((p) => p !== action.path);
      return { ...state, lockedPaths: next, advancedLockedPaths: nextAdv };
    }

    case "ADVANCED_TOGGLE": {
      if (action.enabled) {
        // Bulk-lock managed paths + capture their current resolved values
        // as user overrides so AI cannot drift them.
        let nextOverrides = state.userOverrides;
        for (const p of ADVANCED_MANAGED_PATHS) {
          const v = action.currentValues[p];
          if (v !== undefined) {
            nextOverrides = setByPath(
              nextOverrides as object,
              p,
              v,
            ) as DeepPartial<WorldgenSpecV1>;
          }
        }
        const allLocks = canonicalizeLocks([
          ...state.lockedPaths,
          ...ADVANCED_MANAGED_PATHS,
        ]);
        const advLocks = Array.from(new Set(ADVANCED_MANAGED_PATHS as readonly string[]));
        return {
          ...state,
          userOverrides: nextOverrides,
          lockedPaths: allLocks,
          advancedLockedPaths: advLocks,
        };
      } else {
        // Unlock only paths that were locked BY advanced (not by user).
        const userLocks = new Set(
          state.lockedPaths.filter((p) => !state.advancedLockedPaths.includes(p)),
        );
        const advancedOnly = state.advancedLockedPaths.filter((p) => !userLocks.has(p));
        const nextLocks = state.lockedPaths.filter((p) => !advancedOnly.includes(p));
        return {
          ...state,
          lockedPaths: canonicalizeLocks(nextLocks),
          advancedLockedPaths: [],
        };
      }
    }

    case "ANALYZE_START": {
      return {
        ...state,
        activeAnalyzeRequestId: action.requestId,
        analyzeError: null,
      };
    }

    case "ANALYZE_SUCCESS": {
      // G2 guard — discard outdated response.
      if (action.requestId !== state.activeAnalyzeRequestId) return state;
      const stale =
        state.premise !== action.premiseSnapshot &&
        state.premise.trim() !== action.premiseSnapshot.trim();
      return {
        ...state,
        aiSuggestion: action.spec,
        lastAnalyzedPremise: action.premiseSnapshot,
        isSuggestionStale: stale,
        isBlueprintStale: false,
        activeAnalyzeRequestId: null,
        warnings: action.warnings,
      };
    }

    case "ANALYZE_FAIL": {
      if (action.requestId !== state.activeAnalyzeRequestId) return state;
      return {
        ...state,
        analyzeError: action.error,
        activeAnalyzeRequestId: null,
      };
    }

    case "REGENERATE_BLUEPRINT_START": {
      return {
        ...state,
        activeBlueprintRegenRequestId: action.requestId,
        regenerationNonce: action.nonce,
        blueprintRegenError: null,
      };
    }

    case "REGENERATE_BLUEPRINT_SUCCESS": {
      if (action.requestId !== state.activeBlueprintRegenRequestId) return state;
      return {
        ...state,
        aiSuggestion: action.spec,
        isBlueprintStale: false,
        activeBlueprintRegenRequestId: null,
        warnings: action.warnings,
        // isSuggestionStale unchanged — premise may have been edited mid-flight.
        // (G5 freezes editors during requests, so this branch is defensive only.)
      };
    }

    case "REGENERATE_BLUEPRINT_FAIL": {
      if (action.requestId !== state.activeBlueprintRegenRequestId) return state;
      return {
        ...state,
        blueprintRegenError: action.error,
        activeBlueprintRegenRequestId: null,
        // isBlueprintStale stays true → create stays blocked, regen re-enabled.
      };
    }

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useWorldSetupWizardState(seed?: Partial<WizardState>) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, ...seed });

  // Derived: resolved spec (NEVER in reducer state)
  const resolved = useMemo(
    () => resolveSpec(state.aiSuggestion, state.userOverrides),
    [state.aiSuggestion, state.userOverrides],
  );

  // Derived: lock lookup set
  const lockedPathSet = useMemo(
    () => new Set(state.lockedPaths),
    [state.lockedPaths],
  );

  // Derived: busy state (G3 — no `analyzing` boolean)
  const isAnalyzing = state.activeAnalyzeRequestId !== null;
  const isRegeneratingBlueprint = state.activeBlueprintRegenRequestId !== null;
  const isBusy = isAnalyzing || isRegeneratingBlueprint;

  // ── Action helpers ──
  const setPremise = useCallback(
    (premise: string) => dispatch({ type: "SET_PREMISE", premise }),
    [],
  );

  const setPreWorldPremise = useCallback(
    (preWorldPremise: string, suggested = false) =>
      dispatch({ type: "SET_PRE_WORLD", preWorldPremise, suggested }),
    [],
  );

  const useInspiration = useCallback(
    (premise: string, label: string) =>
      dispatch({ type: "USE_INSPIRATION", premise, label }),
    [],
  );

  const editField = useCallback(
    (path: string, value: unknown) =>
      dispatch({ type: "EDIT_FIELD", path, value }),
    [],
  );

  const resetField = useCallback(
    (path: string) => dispatch({ type: "RESET_FIELD", path }),
    [],
  );

  const lockField = useCallback(
    (path: string) => dispatch({ type: "LOCK_FIELD", path }),
    [],
  );

  const unlockField = useCallback(
    (path: string) => dispatch({ type: "UNLOCK_FIELD", path }),
    [],
  );

  const setAdvancedOverride = useCallback(
    (enabled: boolean) => {
      const cur: Record<string, unknown> = {};
      if (resolved) {
        for (const p of ADVANCED_MANAGED_PATHS) {
          cur[p] = pickPath(resolved, p);
        }
      }
      dispatch({ type: "ADVANCED_TOGGLE", enabled, currentValues: cur });
    },
    [resolved],
  );

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  return {
    state,
    dispatch,
    // Derived
    resolved,
    lockedPathSet,
    isAnalyzing,
    isRegeneratingBlueprint,
    isBusy,
    // Actions
    setPremise,
    useInspiration,
    editField,
    resetField,
    lockField,
    unlockField,
    setAdvancedOverride,
    reset,
  };
}

function pickPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

// ─── External merge of UNCLAMPED override (used by direct deepMerge consumers) ──
export function mergeOverrides<T>(base: T, ov: DeepPartial<T>): T {
  return deepMerge(base, ov);
}
