

User schválil směr Inkrementu 2 a přidal 4 hard refinements. Zapracuji je do finálního locku, plán nechávám stručný — design už je kompletně dohodnutý.

# Playable World Creation — Inkrement 2 (final lock)

## Volby (potvrzené)
- Hybrid preview (schematic default + full preview tlačítko)
- 3 presety MVP
- Premise povinný (min 20 znaků)
- Rebuild in place ve `WorldSetupWizard.tsx`

## 4 refinements (hard requirements)

### R1: Advanced override = explicitní toggle
- Otevření Advanced panelu **nemění** resolved spec
- Uvnitř Advanced: switch `"Použít vlastní parametry mapy"` → teprve ten zapne `advancedOverride.enabled = true`
- Width/height/seed inputy disabled dokud switch není zapnutý

### R2: Preset dirty-state logika
- Každé preset-driven pole (style, victory, premise, terrain knobs) má `dirty` flag
- První edit pole → `dirty = true`
- Při přepnutí presetu: dirty pole se **nepřepíše**, čistá ano
- Tlačítko `"Reset podle presetu"` (zviditelněné jen když existuje aspoň 1 dirty pole) → vyčistí všechny dirty flagy + aplikuje preset

### R3: Canonical payload composer
- Jeden zdroj pravdy v `src/lib/worldBootstrapPayload.ts`:
  ```ts
  composeBootstrapPayload(state) → CreateWorldBootstrapRequest
  composePreviewPayload(state) → PreviewWorldMapRequest  // subset stejného base
  ```
- Preview payload je **derivát** bootstrap payloadu, ne paralelní struktura
- Test: stejný wizard state → identický `{size, terrain, seed}` v obou requestech

### R4: Submit progress = real steps z bootstrap response
- Ne generické spinnery
- Loading panel renderuje 8 kroků: `validate-normalize → world-foundations → server-config → persist-worldgen-spec → generate-world-map → placement-artifacts → mode-specific-seeding → finalize-world-ready`
- Každý step: pending / running / done / failed s durationMs
- Při `failed`: zobrazit `bootstrap_error` z DB

## Dodatečné refinementy

### Preview labeling (R5)
- Schematic: badge `"Rychlý náhled (přibližný)"`
- Full: badge `"Plný náhled (skutečný engine)"`
- Vizuálně odlišný rámeček (např. dashed vs solid border)

### Preview response shape (R6)
`preview-world-map` vrací nejen hex grid, ale i:
```ts
{
  hexes: [...],
  mapWidth, mapHeight,
  seed,
  estimatedStartPositions: number,
  landRatioResolved: number,
}
```
Summary panel zobrazí tyto **resolved** hodnoty po full preview (před tím = client-side odhady).

## Struktura wizardu (potvrzená)

### Vrstva A — Simple
1. Preset karty (3): Doporučený / Souostroví / Velký kontinent
2. Název světa (povinný)
3. Premise textarea (povinný, min 20 znaků, placeholder z presetu)
4. Velikost (Malý 21×21 / Střední 31×31 / Velký 41×41)
5. Styl světa
6. Herní zaměření
7. Počet AI frakcí (0–6)

### Vrstva B — Preview panel
- Schematic mini-mapa (canvas, client-side, instant)
- Tlačítko "🔄 Nový seed"
- Tlačítko "🗺️ Vygenerovat plný náhled"
- Summary box (resolved hodnoty po full preview, jinak client estimates)

### Vrstva C — Advanced (Collapsible)
- Switch `"Použít vlastní parametry mapy"` (R1)
- Width / height / seed (disabled bez switche)
- Land ratio / mountain density / continent shape / continent count

### Submit
- Tlačítko "✨ Vytvořit svět"
- Progress panel s 8 reálnými kroky (R4)
- Error handling z `bootstrap_error`

## Soubory

| Soubor | Akce |
|---|---|
| `src/components/WorldSetupWizard.tsx` | Rebuild in place |
| `src/components/world-setup/PresetCards.tsx` | NEW |
| `src/components/world-setup/SchematicMapPreview.tsx` | NEW (canvas hex render) |
| `src/components/world-setup/AdvancedTerrainPanel.tsx` | NEW (s explicit toggle) |
| `src/components/world-setup/WorldSummaryPanel.tsx` | NEW |
| `src/components/world-setup/BootstrapProgressPanel.tsx` | NEW (8 steps render) |
| `src/lib/worldPresets.ts` | NEW (3 presety) |
| `src/lib/worldBootstrapPayload.ts` | NEW (canonical composer) |
| `src/hooks/useWizardDirtyState.ts` | NEW (dirty flag tracking) |
| `supabase/functions/preview-world-map/index.ts` | NEW (no DB writes) |
| `supabase/config.toml` | +1 block |

## Acceptance criteria

**UI základ (1–9):**
1. Wizard má 3 oddělené vrstvy
2. 3 presety klikatelné, každý přednastaví defaulty
3. Schematic preview <500ms po změně
4. "Nový seed" regeneruje schematic okamžitě
5. "Vygenerovat plný náhled" volá `preview-world-map` <15s
6. Submit volá `create-world-bootstrap`, loading ukazuje step progress
7. Premise validace: min 20 znaků
8. Mobile (271px): vrstvy stackují vertikálně
9. Schematic vs Full preview vizuálně rozlišené (R5)

**Refinements (10–13):**
10. **Preset dirty-state**: ručně změněná pole se přepnutím presetu nepřepíší; "Reset podle presetu" tlačítko viditelné jen když existují dirty pole
11. **Payload parity**: stejný wizard state → identické `{size, terrain, seed}` v preview i create requestech (test)
12. **Advanced explicitnost**: otevření Advanced panelu nezmění resolved spec; spec se mění až po zapnutí switche
13. **Preview response**: `preview-world-map` vrací `{hexes, mapWidth, mapHeight, seed, estimatedStartPositions, landRatioResolved}`; summary panel je zobrazí po full preview

## NEDĚLÁ
❌ Prompt → bias translator (Inkrement 3) · ❌ 3D/icon hex render v preview · ❌ Server-side preview cache · ❌ Removal V1 wizard logiky (rebuild in place, ne čistka) · ❌ Změna create-world-bootstrap contractu · ❌ Více než 3 presety

## Po Inkrementu 2
- Hráč má použitelný wizard s preview, presety, dirty-state safety
- Backend Inkrementu 1 je volaný z UI s reálným step-by-step progressem
- Canonical payload composer připraven pro Inkrement 3 (premise → terrain bias)

