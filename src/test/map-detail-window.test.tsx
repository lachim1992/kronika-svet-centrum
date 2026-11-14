import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import MapDetailWindow, { clampWindowPosition, initialWindowPosition, type MapDetailSection } from "@/components/map/MapDetailWindow";

const roots: Array<{ root: Root; container: HTMLElement }> = [];
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

async function mount(section: MapDetailSection = "overview", onSectionChange = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => root.render(<MapDetailWindow title="Lambadagrad" eyebrow="Město · 1, 2" description="Hráč · Průchodné"
    section={section} onSectionChange={onSectionChange} onClose={vi.fn()} isMobile={false}><p>Obsah</p></MapDetailWindow>));
  return onSectionChange;
}

function pointer(type: string, values: { pointerId: number; clientX: number; clientY: number }) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: values.clientX, clientY: values.clientY });
  Object.defineProperty(event, "pointerId", { value: values.pointerId });
  return event;
}

afterEach(async () => {
  while (roots.length) {
    const item = roots.pop()!;
    await act(async () => item.root.unmount());
    item.container.remove();
  }
  document.body.querySelectorAll('[data-testid="map-detail-window"]').forEach(element => element.remove());
});

describe("floating map detail window", () => {
  it("keeps its initial position and dragged header inside the viewport", () => {
    expect(initialWindowPosition({ x: 1200, y: 900 })).toEqual({ x: 596, y: 76 });
    expect(clampWindowPosition({ x: -50, y: 1200 }, { x: 1200, y: 900 }, { x: 580, y: 700 })).toEqual({ x: 8, y: 848 });
  });

  it("switches logical sections without a modal map backdrop", async () => {
    const onSectionChange = await mount();
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Sekce detailu"] button'));
    await act(async () => { buttons[1].click(); });
    await act(async () => { buttons[2].click(); });
    expect(onSectionChange.mock.calls.map(call => call[0])).toEqual(["parcels", "growth"]);
    expect(document.querySelector('[data-testid="map-detail-window"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="map-detail-window"].inset-0')).toBeNull();
  });

  it("moves by its header with pointer capture rather than dragging the map", async () => {
    await mount();
    const panel = document.querySelector<HTMLElement>('[data-testid="map-detail-window"]')!;
    const header = document.querySelector<HTMLElement>('[aria-label="Táhnutím přesunout okno"]')!;
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({ left: 596, top: 76 } as DOMRect);
    header.setPointerCapture = vi.fn();
    header.hasPointerCapture = vi.fn(() => false);
    await act(async () => { header.dispatchEvent(pointer("pointerdown", { pointerId: 7, clientX: 700, clientY: 90 })); });
    await act(async () => { header.dispatchEvent(pointer("pointermove", { pointerId: 7, clientX: 500, clientY: 190 })); });
    expect(panel.style.left).toBe("396px");
    expect(panel.style.top).toBe("176px");
    expect(header.setPointerCapture).toHaveBeenCalledWith(7);
  });
});
