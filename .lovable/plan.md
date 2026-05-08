## Audit: nálezy

**1. „Není objeveno"** — `WorldTab.tsx:85` blokuje klik na cizí město, dokud není v `entity_discoveries`. Discovery vzniká jen přes `Prozkoumat hex` nebo vlastnictví. Sousední neutrální město viditelné na mapě tedy zůstává zamčené.

**2. „Nelze přidat do trade zone"** — Trade systems (`compute-trade-systems`) jsou **automatické** connected components nodů přes `province_routes`. Přístup hráče k cizímu systému se projektuje **pouze** ze:
- vlastnictví uzlu, nebo
- aktivní `diplomatic_treaties` typu `open_borders` / `trade_access`.

Aktuální `DiplomacyPanel` ale **vůbec nepíše do `diplomatic_treaties`** → žádný hráč nemůže získat přístup do cizího systému. To je root cause.

**3. Žádný kontextový menu na město** — klik = rovnou ChroWiki. Žádný obchod, žádná diplomacie, žádná špionáž.

**4. Single click otevírá detail** — koliduje s panem na mapě.

---

## Návrh — UX „klik na město"

```text
single click   → nic (jen pan / deselect)
double click   → CityActionsPopover (Sheet z pravé strany)
                  ├ status: discovered? vlastník? trade access?
                  ├ akce: Navázat kontakt / Žádost o trade access
                  │       Vytvořit obchodní route (prefill TradePanel)
                  │       Diplomacie (otevře DiplomacyPanel)
                  │       Špionáž / Vyslat armádu / Útok
                  └ tlačítko 📜 Otevřít wiki (ChroWiki)
triple click   → rovnou ChroWiki (shortcut pro power-usery)
```

Frontier hex: `single` = nic, `double` = Prozkoumat (přesun z aktuálního single).

---

## Implementace

### A) `WorldHexMap.tsx`
- `handleTileClick`: přesunout `handleExploreFrontier(q,r)` z single na double.
- `CityMarkerBadge.onClick`: přepnout na `onDoubleClick`. Single → no-op (povolí pan).
- Přidat 3-click detekci přes `clickCountRef` s 350ms reset → triple = `onCityTripleClick`.

### B) Nová komponenta `src/components/map/CityActionsPopover.tsx`
- Props: `cityId`, `sessionId`, `currentPlayerName`, `onClose`, `onOpenWiki`, `onOpenDiplomacy`, `onOpenTrade`.
- Načte: city + owner_player + `entity_discoveries` + `player_trade_system_access` + `diplomatic_treaties` (status='active' s vlastníkem).
- Sekce **Status**: discovered ✓/✗, vztah (owner/cizí/neutral), aktivní smlouvy, trade access level (`direct/treaty/visible/none`).
- Sekce **Akce** (kontextové, gated podle stavu):
  - `Auto-objevit` — zobraz pokud nediscovered + sousední/v dohledu (hybrid). Insert do `entity_discoveries`.
  - `Vyslat poselstvo` — pokud nediscovered a vzdálený. Insert `entity_discoveries` + cost 20 zlata + 1 turn (přes command-dispatch).
  - `Žádost o trade access` — pokud discovered, cizí majitel, není smlouva. Vytvoří `diplomatic_treaties` row se statusem `pending` + INSERT `world_event` `trade_access_requested` (notifikace pro 2. hráče).
  - `Vytvořit obchodní route` — otevře TradePanel s prefillem.
  - `Diplomacie` — otevře DiplomacyPanel (state cílového hráče).
  - `Špionáž`, `Vyslat armádu`, `Útok` — placeholder/redirect na existující flowy.
- Spodek: malý ghost button `📜 Otevřít wiki`.

### C) `WorldTab.tsx`
- Přidat state `cityPopover: { cityId } | null`.
- `handleEntityClick("city", id)` → `setCityPopover({cityId: id})` (odstranit hard block na `isDiscovered`; popover si poradí).
- Nové `handleCityTriple("city", id)` → původní `onEntityClick` (= ChroWiki).
- Render `<CityActionsPopover>` jako Sheet.

### D) Treaty acceptance flow (mini — bez plné UI):
- Příjemce vidí v `WorldFeedPanel` (event `trade_access_requested`) toast „X žádá o obchodní přístup k Y" + tlačítko **Přijmout** / **Odmítnout** v existujícím EventDetailModal.
- Přijetí: update `diplomatic_treaties.status='active'`, `signed_turn=current_turn`, smaže/closuje event. Po `commit-turn` se `compute-trade-systems` přepočítá → access projeven.

### E) Auto-discovery hybrid helper `src/lib/discovery.ts`
- `canAutoDiscover(cityHex, playerHexes)`: `true` pokud city hex sousedí s libovolným vlastním hexem nebo je v `discoveredCoords`.
- Auto-discover se spustí při otevření popoveru (idempotentní upsert).

---

## Soubory

**Nové:**
- `src/components/map/CityActionsPopover.tsx`
- `src/lib/discovery.ts`

**Upravit:**
- `src/components/WorldHexMap.tsx` (single/double/triple, frontier double-click)
- `src/pages/game/WorldTab.tsx` (handleEntityClick, render popover)
- `src/components/WorldFeedPanel.tsx` + `EventDetailModal.tsx` (Accept/Decline trade_access_requested)

**Migrace:**
- Přidat `'pending'` do dovolených statusů `diplomatic_treaties` (CHECK je v migraci flexibilní text → není potřeba migrace).

---

## Mimo scope (řeknu si pak):
- Plné UI pro všechny treaty typy v DiplomacyPanel.
- Špionáž jako reálná mechanika (zatím jen placeholder tlačítko).
- Auto-merge stacku do města (slíbil jsem v minulém kole — udělám hned po tomhle).