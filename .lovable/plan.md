
# Audit Dev Tab + Refaktor World Map (varianta: Bottom Floating Bar)

## Část 1 — Dev Tab audit

Po Phase 0+1 ekonomického refaktoringu je Dev tab **z 90 % aktuální**. Konkrétně:

| Sekce | Stav | Poznámka |
|---|---|---|
| Engine (RealSimulation, Hydration, Integrity, DevConsole) | ✅ aktuální | Volá refresh-economy / commit-turn správně |
| Data & Seeding (SeedSection, EconomyQA, QATest) | ✅ aktuální | EconomyQASection už pokrývá basket diagnostics |
| Editors (NodeSpawner, NodeEditor, PlayerEditor, FormulaTuner) | ✅ aktuální | |
| **Economy (GoodsEconomyDebugPanel)** | ⚠️ ověřit | Může ještě ukazovat legacy basket keys před remapem |
| **Infrastructure (HexNodeMechanicsPanel, ProvinceGraph)** | ⚠️ ověřit | Po Phase 1 backfillu by měly fungovat — vizuální audit |
| Observatory | ✅ aktuální | |

**P0 fix v Dev tabu:**
- Audit `GoodsEconomyDebugPanel` a `HexNodeMechanicsPanel` — ověřit, že čtou aktuální `capability_tags` + 12 canonical basket keys; přidat fallback labely u legacy hodnot.
- Přidat shortcut na nový `TradeSystemSupplyPanel` taky do Dev tabu (dnes je jen v Economy → Dev panels).

---

## Část 2 — World Map: identifikované problémy

### Co je rozbité v `WorldHexMap.tsx` (2187 řádků)

1. **Legenda je schovaná v `bottom-3 left-3`** — překrývá se s `WorldMapBuildPanel` floating sheet, na 1087×770 ji uživatel nevidí.
2. **Pan vs klik konflikt** — drag threshold 3 px je příliš nízký; klik na node/hex se snadno zaregistruje jako drag.
3. **Wheel zoom je agresivní** (`deltaY * 0.001` bez per-event clampu) — Mac trackpad pinch shazuje zoom o desítky % v jednom gestu.
4. **Inertia po panu pokračuje** i když uživatel klikne (mizí target, klik se „mine").
5. **Žádné vizuální cues** při dragu (kurzor se nemění z `default` na `grab`/`grabbing`).
6. **Floating UI chaos** — 6 floating bloků v rozích (position badge, stats, world name, admin DEV switch, zoom, legend) se navzájem překrývají.
7. **Chybí keyboard shortcuts** kromě WASD pro pohyb.

---

## Část 3 — Refaktor World Map (P0)

### A. Bottom Floating Bar (Google-Maps style)

Sjednocený horizontální dock zarovnaný **bottom-center**, podobně jako Google Maps tools:

```text
                  ┌─────────────────────────────────────────────┐
                  │ [🔍−] [100%] [🔍+] │ [🏠] │ [Layers ▾] │ [⚙ DEV] │
                  └─────────────────────────────────────────────┘
                              bottom-4, center, max-w-fit
```

- **Vždy viditelný**, jeden pruh, žádné překrývání rohů.
- Sekce oddělené vertikálními dividery: zoom group | home | layers | dev (admin only).
- Mobile: stejný layout, jen menší ikony + skrytí % indikátoru.

### B. Nová `MapLegendPopover` komponenta

- Klik na **„Layers ▾"** v bottom baru → otevře popover **nad** dockem (popup-up).
- Tabbed obsah:
  - **Vrstvy** (toggle switches): Provincie / Silnice / Vliv / Trade Systems / Under-construction / Economy flow
  - **Biomy** (color key, read-only)
  - **Provincie** (seznam s color swatches + vlastník)
  - **Klávesové zkratky** (cheat-sheet)
- Persistence toggles přes `localStorage` key `worldmap.layers.v1`.

### C. Fixy ovládání

| Problém | Fix |
|---|---|
| Klik vs drag | Drag threshold 3 → **8 px** + time guard >120 ms; pod thresholdem = klik. |
| Wheel agresivní | Step `deltaY * 0.0015` clamped na max ±10 % per event; respektovat `e.ctrlKey` (trackpad pinch). |
| Inertia interferuje | `onPointerDown` cancel `inertiaRef` (už existuje, ale fix ordering). |
| Žádný cursor feedback | `cursor-grab` → `cursor-grabbing` při aktivním dragu. |
| Chybí shortcuts | `+`/`-` zoom, `0` reset zoom, `H` home, `L` toggle layers popover, `Esc` clear selection. |

### D. Top-area cleanup

- **Top-left**: jen position badge (`📍 (q,r) Město`) — ostatní stats (provincie / hranice count) přesunout do legend popoveru.
- **Top-center**: world name (zachovat).
- **Top-right**: úplně vyklidit — admin DEV switch a recompute buttons přesunout do bottom dock pod „⚙ DEV" sekci.

---

## Implementační kroky

1. **Vytvořit `src/components/map/MapBottomDock.tsx`** — horizontální floating bar (zoom −/%/+, home, layers button, dev cluster).
2. **Vytvořit `src/components/map/MapLayersPopover.tsx`** — tabs: Vrstvy / Biomy / Provincie / Zkratky; popup-up nad dockem.
3. **Refaktor `WorldHexMap.tsx`**:
   - Vyhodit inline legend block (řádky 1346–1500) → nahradit `<MapLayersPopover />`.
   - Vyhodit zoom column right-3 (řádky 1333–1343) → přesunout do `<MapBottomDock />`.
   - Vyhodit admin top-right cluster (řádky 1300–1330) → přesunout do dock dev-cluster.
   - Drag threshold 3 → 8 px + time guard.
   - Wheel: clamp na ±0.1 per event.
   - PointerDown: cancel inertia first thing.
   - CSS cursor states (`cursor-grab` / `cursor-grabbing`).
   - Rozšířit `handleKeyDown` o nové shortcuts.
   - Layer toggle states do `localStorage` (`worldmap.layers.v1`).
4. **Audit `GoodsEconomyDebugPanel` + `HexNodeMechanicsPanel`** — ověřit data sources po backfillu, přidat fallback labely.
5. **Přidat `TradeSystemSupplyPanel`** do Dev tab → Economy sekce.

### Co NEDĚLÁM v P0

- Nerozbíjím 2187-řádkový `WorldHexMap.tsx` na menší soubory (P1, riziko).
- Neměním vlastní rendering hexů ani SVG vrstvy.
- Neměním logiku `WorldMapBuildPanel` (jen ho nechám floating tam, kde je — bottom dock je centrovaný, takže nekoliduje).

---

## Výsledek pro uživatele

- **Jeden floating bar dole = vždy víš kde co je**, žádné rohy.
- **Klik na hex/node funguje spolehlivě**, protože drag se rozezná jen u skutečného pohybu.
- **Trackpad zoom je předvídatelný**, ne skokový.
- **Legenda zpět** + s persistence layer toggles + s biome key + se zkratkami.
- **Dev tab konzistentní** s aktuálním ekonomickým modelem (12 canonical baskets).
