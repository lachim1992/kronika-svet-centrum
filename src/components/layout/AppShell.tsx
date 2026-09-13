import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import AppSidebar from "./AppSidebar";
import BottomNav, { type TabId } from "./BottomNav";
import MapTopNav from "./MapTopNav";

interface AppShellProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  showDevTab?: boolean;
  showPersistentTab?: boolean;
  worldName?: string;
  header: ReactNode;
  resourceHud: ReactNode;
  children: ReactNode;
  bottomExtras?: ReactNode;
  mapBackground?: ReactNode;
}

const AppShell = ({
  activeTab,
  onTabChange,
  showDevTab,
  showPersistentTab,
  worldName,
  header,
  resourceHud,
  children,
  bottomExtras,
  mapBackground,
}: AppShellProps) => {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const mapFirst = Boolean(mapBackground);

  const sidebarWidth = isMobile ? 0 : sidebarCollapsed ? 56 : 260;

  return (
    <div className={cn("min-h-screen bg-background", mapFirst && "map-first-shell")}>
      {mapFirst && <div className="fixed inset-0 z-0">{mapBackground}</div>}
      {/* Sidebar (desktop only) */}
      {!mapFirst && <AppSidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        collapsed={sidebarCollapsed}
        onCollapse={setSidebarCollapsed}
        showDevTab={showDevTab}
        showPersistentTab={showPersistentTab}
        worldName={worldName}
      />}

      {/* Main area offset by sidebar width */}
      <div
        className="flex flex-col h-screen transition-all duration-200"
        style={{ marginLeft: mapFirst ? 0 : sidebarWidth }}
      >
        {/* Sticky header + HUD */}
        <div className="sticky top-0 z-40 shrink-0">
          {header}
          {resourceHud}
          {mapFirst && (
            <MapTopNav
              activeTab={activeTab}
              onTabChange={onTabChange}
              showDevTab={showDevTab}
              showPersistentTab={showPersistentTab}
            />
          )}
        </div>

        {/* Scrollable content */}
        <main
          className={cn(
            "flex-1 overflow-y-auto",
            mapFirst ? "relative z-10 p-0" : "px-4 py-4 space-y-4",
            isMobile && "pb-20" // leave room for BottomNav
          )}
        >
          {children}
        </main>
      </div>

      {/* Bottom nav (mobile only) */}
      {isMobile && !mapFirst && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={onTabChange}
          showDevTab={showDevTab}
          showPersistentTab={showPersistentTab}
        />
      )}

      {bottomExtras}
    </div>
  );
};

export default AppShell;
