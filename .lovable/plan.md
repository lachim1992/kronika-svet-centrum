

# World Map Upgrade — Economy v4.2 Alignment

## Problem

The world map has 4 separate overlay layers (Province, Roads, Strategic Network, Trade Network) with legacy flow types (`production`, `supply`, `wealth`, `faith`, `military`, `migration`, `food`, `culture`) that don't correspond to the economy v4.2 model. The v4.2 data lives in `trade_flows`, `city_market_baskets`, and `market_shares` tables with goods-level granularity (wheat, iron, etc.), but the map visualizes abstract flow categories from v3.

Additionally, the UX has friction: SVG-based pan/zoom feels jittery, the legend is cramped, and there's no smooth inertia scrolling.

## What changes

### A. UX improvements to WorldHexMap

1. **Smooth inertia scrolling**: Add velocity tracking to pointer drag — on release, continue panning with deceleration (requestAnimationFrame loop). Currently pan stops instantly on pointer up.

2. **Zoom to cursor**: When scrolling mouse wheel, zoom toward the cursor position instead of the center. Currently `setZoom` changes scale uniformly regardless of mouse position.

3. **Minimap**: Add a small fixed minimap (bottom-right, ~120x80px) showing all discovered hexes as dots with a viewport rectangle indicator. Click on minimap to jump to position.

4. **Double-click to zoom**: Double-click on hex zooms in by 0.5 and centers on that hex (in addition to opening detail on second double-click).

5. **Mobile: momentum scrolling**: Apply same inertia to touch drag for smoother mobile experience.

6. **Legend redesign**: Replace the cramped inline legend with a collapsible sidebar-style panel (left side, 200px). Sections for: Provinces, Biomes, Economy Overlay. Each section collapses independently.

### B. Economy v4.2 overlay — replace all legacy overlays

**Remove**: `StrategicMapOverlay`, `RouteCorridorsOverlay`, `TradeNetworkOverlay` as separate components.

**Replace with**: Single `EconomyFlowOverlay` component that visualizes economy v4.2 data:

1. **Trade flows between cities**: Lines from `trade_flows` table showing actual goods movement between cities. Color-coded by goods category (food=green, raw materials=brown, luxury=gold, manufactured=blue). Line thickness = `volume_per_turn`. Arrow direction shows source→target.

2. **Route corridors**: Keep `flow_paths` hex-traced paths from `RoadNetworkOverlay` (these are correct infrastructure paths). But color them by economic utilization — routes carrying more trade volume glow brighter.

3. **City market indicators**: At each city position, show a small radial chart or badge showing `domestic_satisfaction` from `city_market_baskets`. Green = well-supplied, red = deficit.

4. **Market share flows**: Optional sub-layer showing export corridors — which cities export what baskets, following route paths.

**Legend entries for the new overlay**:
- 🌾 Potraviny (food goods flow)
- ⛏️ Suroviny (raw materials flow)  
- ✨ Luxus (luxury goods flow)
- 🔨 Výrobky (manufactured goods flow)
- Route utilization (low→high color ramp)
- City satisfaction indicator (green/yellow/red)

### C. Dev mode tools — update for v4.2

**In HexDevTools**, update the "Trade Routes" section:

1. Replace legacy flow type selectors with v4.2 goods-based route creation
2. Add "Simulate trade flow" button that creates a `trade_flows` entry between two nodes
3. Show per-route trade volume and goods breakdown
4. Add "Recompute trade flows" quick action that calls `compute-trade-flows`

**In map dev controls** (top-right):
- Replace "Cesty" button with "♻️ Přepočítat ekonomiku" that calls `refresh-economy`
- Add toggle for economy overlay sub-layers (goods categories)

### D. Corridor control visualization

When economy overlay is active:
- Routes owned/controlled by the player show a subtle colored border matching player's province color
- Chokepoints (hexes where multiple routes converge) get a special indicator
- `control_state` from `province_routes` shown as route style: `open`=solid, `contested`=dashed, `blocked`=red dashed, `embargoed`=dotted

## Files changed

| File | Change |
|------|--------|
| `src/components/WorldHexMap.tsx` | Add inertia scrolling, zoom-to-cursor, minimap, replace 3 overlay toggles with single economy overlay toggle, update legend |
| `src/components/map/EconomyFlowOverlay.tsx` | **New** — v4.2 goods-based trade visualization |
| `src/components/map/StrategicMapOverlay.tsx` | **Delete** — replaced by EconomyFlowOverlay |
| `src/components/map/RouteCorridorsOverlay.tsx` | **Delete** — merged into EconomyFlowOverlay |
| `src/components/map/TradeNetworkOverlay.tsx` | **Delete** — replaced by EconomyFlowOverlay |
| `src/components/map/RoadNetworkOverlay.tsx` | **Keep** — infrastructure layer stays, enhanced with utilization coloring |
| `src/components/map/HexDevTools.tsx` | Update trade route section for v4.2 goods flows |
| `src/components/map/MapMinimap.tsx` | **New** — minimap component |

## Execution order

1. UX improvements (inertia, zoom-to-cursor) in WorldHexMap
2. Create EconomyFlowOverlay reading from `trade_flows` + `city_market_baskets`
3. Replace legend with economy v4.2 entries
4. Delete StrategicMapOverlay, RouteCorridorsOverlay, TradeNetworkOverlay
5. Update RoadNetworkOverlay with utilization coloring
6. Update HexDevTools for v4.2
7. Add minimap

## What does NOT change

- No database schema changes
- No edge function changes
- `RoadNetworkOverlay` infrastructure paths stay (they read from `flow_paths` which is correct)
- Province overlay stays unchanged
- Hex tile rendering stays unchanged
- Military/battle mechanics stay unchanged

