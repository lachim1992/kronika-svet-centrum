import { useCallback, useEffect, useState } from "react";

/**
 * Sandbox (testing) mode — lets the player build and upgrade anything without
 * paying resources or waiting for construction turns. Every change still
 * produces its normal game effects, so results stay observable.
 */
const STORAGE_KEY = "ch_sandboxBuild";
const EVENT = "ch:sandbox-mode";

export const isSandboxMode = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const setSandboxMode = (value: boolean) => {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT));
};

export const useSandboxMode = () => {
  const [sandbox, setSandbox] = useState(isSandboxMode);

  useEffect(() => {
    const sync = () => setSandbox(isSandboxMode());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggleSandbox = useCallback(() => setSandboxMode(!isSandboxMode()), []);

  return { sandbox, toggleSandbox, setSandbox: setSandboxMode };
};
