import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MapDetailWindow, { clampWindowPosition, initialWindowPosition, type MapDetailSection } from "@/components/map/MapDetailWindow";

function Window({ section = "overview", onSectionChange = vi.fn() }: { section?: MapDetailSection; onSectionChange?: (section: MapDetailSection) => void }) {
  return <MapDetailWindow title="Lambadagrad" eyebrow="Město · 1, 2" description="Hráč · Průchodné"
    section={section} onSectionChange={onSectionChange} onClose={vi.fn()} isMobile={false}>
    <p>Obsah</p>
  </MapDetailWindow>;
}

describe("floating map detail window", () => {
  it("keeps its initial position and dragged header inside the viewport", () => {
    expect(initialWindowPosition({ x: 1200, y: 900 })).toEqual({ x: 596, y: 76 });
    expect(clampWindowPosition({ x: -50, y: 1200 }, { x: 1200, y: 900 }, { x: 580, y: 700 })).toEqual({ x: 8, y: 848 });
  });

  it("switches logical sections and closes without a modal map backdrop", () => {
    const onSectionChange = vi.fn();
    const { container } = render(<Window onSectionChange={onSectionChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Parcely" }));
    fireEvent.click(screen.getByRole("button", { name: "Rozrůst" }));
    expect(onSectionChange.mock.calls.map(call => call[0])).toEqual(["parcels", "growth"]);
    expect(screen.getByTestId("map-detail-window")).toBeInTheDocument();
    expect(container.querySelector(".inset-0")).toBeNull();
  });

  it("moves by its header with pointer capture rather than dragging the map", () => {
    render(<Window />);
    const panel = screen.getByTestId("map-detail-window");
    const header = screen.getByLabelText("Táhnutím přesunout okno");
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({ left: 596, top: 76 } as DOMRect);
    header.setPointerCapture = vi.fn();
    header.hasPointerCapture = vi.fn(() => false);
    fireEvent.pointerDown(header, { button: 0, pointerId: 7, clientX: 700, clientY: 90 });
    fireEvent.pointerMove(header, { pointerId: 7, clientX: 500, clientY: 190 });
    expect(panel.style.left).toBe("396px");
    expect(panel.style.top).toBe("176px");
    expect(header.setPointerCapture).toHaveBeenCalledWith(7);
  });
});
