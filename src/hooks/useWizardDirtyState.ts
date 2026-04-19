import { useCallback, useRef, useState } from "react";

/**
 * Tracks which preset-driven fields have been manually edited by the user.
 *
 * Contract:
 *  - `markClean(field)` is called when the preset programmatically sets a value.
 *  - `markDirty(field)` is called when the user edits a field via the UI.
 *  - `isDirty(field)` → has user touched this field since last preset apply?
 *  - `hasAnyDirty()` → returns true if at least one field is dirty (used to
 *    show the "Reset podle presetu" button).
 *  - `resetAll()` clears all dirty flags (used when user explicitly accepts
 *    a preset reset).
 *
 * The hook does NOT store field values — only dirty flags. Values live in
 * the consumer's own useState calls.
 */
export function useWizardDirtyState() {
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  // Track suppress flags so programmatic preset writes don't accidentally
  // mark themselves dirty via onChange handlers.
  const suppressNextRef = useRef<Set<string>>(new Set());

  const suppressNext = useCallback((field: string) => {
    suppressNextRef.current.add(field);
  }, []);

  const markDirty = useCallback((field: string) => {
    if (suppressNextRef.current.has(field)) {
      suppressNextRef.current.delete(field);
      return;
    }
    setDirtyFields((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  }, []);

  const markClean = useCallback((field: string) => {
    setDirtyFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }, []);

  const isDirty = useCallback(
    (field: string) => dirtyFields.has(field),
    [dirtyFields],
  );

  const hasAnyDirty = useCallback(
    () => dirtyFields.size > 0,
    [dirtyFields],
  );

  const resetAll = useCallback(() => {
    setDirtyFields(new Set());
    suppressNextRef.current.clear();
  }, []);

  return {
    isDirty,
    hasAnyDirty,
    markDirty,
    markClean,
    suppressNext,
    resetAll,
    dirtyCount: dirtyFields.size,
  };
}
