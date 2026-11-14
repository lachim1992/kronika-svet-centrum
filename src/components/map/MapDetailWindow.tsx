import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Castle, Grid3x3, LandPlot, MapPinned, Move, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MapDetailSection = "overview" | "parcels" | "growth" | "territory";
export type WindowPoint = { x: number; y: number };

export function clampWindowPosition(point: WindowPoint, viewport: WindowPoint, windowSize: WindowPoint): WindowPoint {
  return {
    x: Math.max(8, Math.min(point.x, Math.max(8, viewport.x - windowSize.x - 8))),
    y: Math.max(8, Math.min(point.y, Math.max(8, viewport.y - 52))),
  };
}

export function initialWindowPosition(viewport: WindowPoint, width = 580): WindowPoint {
  return clampWindowPosition(
    { x: viewport.x - width - 24, y: 76 },
    viewport,
    { x: width, y: 0 },
  );
}

const SECTIONS: Array<{ id: MapDetailSection; label: string; icon: typeof Castle }> = [
  { id: "overview", label: "Přehled", icon: Castle },
  { id: "parcels", label: "Parcely", icon: Grid3x3 },
  { id: "growth", label: "Rozrůst", icon: LandPlot },
  { id: "territory", label: "Území", icon: MapPinned },
];

type Props = {
  title: string;
  eyebrow: string;
  description: string;
  section: MapDetailSection;
  onSectionChange: (section: MapDetailSection) => void;
  onClose: () => void;
  isMobile: boolean;
  children: ReactNode;
};

/** Non-modal map inspector: only the window consumes pointer input, the map stays usable. */
export default function MapDetailWindow({
  title, eyebrow, description, section, onSectionChange, onClose, isMobile, children,
}: Props) {
  const windowRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [position, setPosition] = useState<WindowPoint>(() => initialWindowPosition({
    x: typeof window === "undefined" ? 1280 : window.innerWidth,
    y: typeof window === "undefined" ? 900 : window.innerHeight,
  }));

  useEffect(() => {
    if (isMobile) return;
    const keepVisible = () => {
      const element = windowRef.current;
      if (!element) return;
      setPosition(current => clampWindowPosition(current,
        { x: window.innerWidth, y: window.innerHeight },
        { x: element.offsetWidth, y: element.offsetHeight },
      ));
    };
    window.addEventListener("resize", keepVisible);
    return () => window.removeEventListener("resize", keepVisible);
  }, [isMobile]);

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isMobile || event.button !== 0 || !windowRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = windowRef.current.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const element = windowRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !element) return;
    event.preventDefault();
    event.stopPropagation();
    setPosition(clampWindowPosition(
      { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY },
      { x: window.innerWidth, y: window.innerHeight },
      { x: element.offsetWidth, y: element.offsetHeight },
    ));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return createPortal(
    <aside
      ref={windowRef}
      aria-label={`Detail: ${title}`}
      data-testid="map-detail-window"
      className={isMobile
        ? "map-tile-detail fixed inset-x-0 bottom-0 z-[70] flex max-h-[68vh] flex-col rounded-t-2xl border border-primary/25 bg-background/95 shadow-2xl backdrop-blur-xl"
        : "map-tile-detail fixed z-[70] flex h-[min(780px,calc(100vh-96px))] w-[min(580px,calc(100vw-32px))] flex-col rounded-xl border border-primary/25 bg-background/95 shadow-2xl backdrop-blur-xl"}
      style={isMobile ? undefined : { left: position.x, top: position.y }}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <div
        className={`flex items-center gap-3 border-b border-primary/20 bg-card/70 px-4 py-3 ${isMobile ? "rounded-t-2xl" : "cursor-move rounded-t-xl"}`}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label={isMobile ? "Záhlaví detailu" : "Táhnutím přesunout okno"}
      >
        {!isMobile && <Move className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
          <h2 className="truncate text-lg leading-tight">{title}</h2>
          <p className="truncate text-[11px] text-muted-foreground">{description}</p>
        </div>
        <Button size="icon" variant="ghost" className="shrink-0" aria-label="Zavřít detail" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <nav aria-label="Sekce detailu" className="grid shrink-0 grid-cols-4 gap-1 border-b border-border/70 bg-background/80 p-2">
        {SECTIONS.map(item => {
          const Icon = item.icon;
          const active = section === item.id;
          return <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSectionChange(item.id)}
            className={`flex min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors ${active
              ? "border-primary/45 bg-primary/15 text-primary"
              : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </button>;
        })}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" data-detail-section={section}>
        {children}
      </div>
    </aside>,
    document.body,
  );
}
