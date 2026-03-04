import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface DevModeContextType {
  devMode: boolean;
  toggleDevMode: () => void;
  setDevMode: (v: boolean) => void;
}

const DevModeContext = createContext<DevModeContextType>({
  devMode: false,
  toggleDevMode: () => {},
  setDevMode: () => {},
});

export const DevModeProvider = ({ children, allowed }: { children: ReactNode; allowed: boolean }) => {
  const [devMode, setDevMode] = useState(() => {
    if (!allowed) return false;
    return localStorage.getItem("ch_devMode") === "1";
  });

  const toggleDevMode = useCallback(() => {
    if (!allowed) return;
    setDevMode(prev => {
      const next = !prev;
      localStorage.setItem("ch_devMode", next ? "1" : "0");
      return next;
    });
  }, [allowed]);

  const set = useCallback((v: boolean) => {
    if (!allowed && v) return;
    localStorage.setItem("ch_devMode", v ? "1" : "0");
    setDevMode(v);
  }, [allowed]);

  return (
    <DevModeContext.Provider value={{ devMode: allowed && devMode, toggleDevMode, setDevMode: set }}>
      {children}
    </DevModeContext.Provider>
  );
};

export const useDevMode = () => useContext(DevModeContext);
