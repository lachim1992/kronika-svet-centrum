# v9.1 Wave 2 — Skutečný runtime impact

## Stav po Wave 1 (hotovo)

✅ DB: `province_nodes.mythic_tag/founding_era/heritage_lineage_id`, `realm_heritage`, `route_state` (171 záznamů)  
✅ Edge: `world-layer-bootstrap`, `world-layer-tick` (Phase 4 maintenance + Phase 9 cleanup)  
✅ UI: `LineageSelector` ve wizardu, `RealmHeritageBadge` v RealmDashboard  
✅ Integrace: `create-world-bootstrap` step 7b, `commit-turn` step 5c

## Co stále chybí pro plný v9.1 dopad

Aktuálně AI sice generuje historii, ale:
- Hráč nikdy nevidí **route_state** na mapě (decay/maintenance je neviditelný)
- **Migrace** mezi nody (Phase 7) neexistuje – ekonomika nepřetéká do sousedních uzlů
- **Mýtické nody** se jen taggují, ale nemají žádný strategický efekt
- **Heritage** se uloží, ale nedává žádné bonusy
- Žádný způsob, jak route ručně udržovat / restorovat

## Wave 2 — 4 PR sety

### PR-D: Route lifecycle visibility + manuální údržba
**DB:**
- Migration: přidat `route_state.player_invested_gold` (int, default 0), `route_state.last_maintained_turn`
- View `v_route_with_state` joinující `province_routes` + `route_state` pro UI

**Edge:**
- Nová funkce `manage-route` (commands: `INVEST_MAINTENANCE`, `RESTORE_ROUTE`, `ABANDON_ROUTE`) – odečte gold, posune lifecycle
- `world-layer-tick`: rozšířit o transition `degraded → blocked` po 3 nezaplacených turnech, `restored → usable`

**UI:**
- `RouteStatePanel.tsx`: zobrazit per-route lifecycle, maintenance cost, decay countdown
- `RoadNetworkOverlay`: barevné kódování dle `lifecycle_state` (zelená=maintained, žlutá=degraded, červená=blocked)
- Tlačítko "Investovat 50g do údržby" v hex/route detailu

### PR-E: Migrace mezi uzly (Phase 7)
**DB:**
- Tabulka `node_migrations` (session_id, turn, from_node, to_node, population_delta, reason, route_id)
- Sloupce v `province_nodes`: `migration_pull` (numeric), `migration_push` (numeric) — derived per turn

**Edge:**
- `world-layer-tick` rozšířit o **Phase 7**:
  - Push score = nedostatek staple_food / fuel z `city_market_baskets.fulfillment_ratio`
  - Pull score = surplus + heritage affinity ×1.2 + route_state.maintenance_level/100
  - Throughput cap = `route_state.maintenance_level` × 0.1 lidí/turn
  - Transfer populace mezi `cities.population` (cap 5% za turn)
  - Zápis do `node_migrations` + `world_events` (chronicle entry)

**UI:**
- `MigrationOverlay.tsx` na mapě (animované šipky mezi nody)
- `MigrationFeed` v ChronicleTab

### PR-F: Heritage bonusy + mýtické nody efekt
**DB:**
- Tabulka `heritage_effects` (lineage_id text, effect_type text, value numeric, target text)
- Seed: každá lineage z `realm_heritage` dostane 2-3 efekty (např. "Námořníci → +15% trade route maintenance discount", "Horalé → +10% production v hill nodech)

**Edge:**
- `refresh-economy`: aplikovat `heritage_effects` na příslušné výpočty
- `world-layer-tick` Phase 8: mýtické nody (`mythic_tag IS NOT NULL`) generují 1-3 prestige/turn, čistě pasivně
- Při kontaktu hráče s mýtickým nodem (vzdálenost ≤ 2 hexy) → chronicle event "Pradávný odkaz nalezen"

**UI:**
- `HeritageEffectsPanel` v RealmDashboard (pod badge): seznam aktivních bonusů
- `MythicNodeMarker` na mapě (zlatá ikona ★)
- Tooltip mýtického nodu zobrazí flavor text z `ancient_layer.mythic_seeds`

### PR-G: Cleanup beta-only dokumentace
- Smazat `docs/architecture/world-layer-activation-gate.md` (G1-G6 už neaplikujeme)
- `docs/architecture/world-layer-contract.md`: odstranit Track 1/2 split, zachovat K1-K5
- Smazat `scripts/check-track1-writes.ts` (žádný Track 1 už neexistuje)
- Aktualizovat `.lovable/plan.md` na "v9.1 unified" status

## Pořadí a doporučení

**Doporučuji PR-D → PR-E → PR-F → PR-G** v jednom běhu. PR-D je nejviditelnější (hráč okamžitě vidí decay na mapě), PR-E zavádí skutečnou dynamiku populace, PR-F dává heritage smysl. PR-G je úklid.

## Otázky k rozhodnutí

1. **Maintenance gold sink** — chceš aby decay routes skutečně utráceli gold z `realm_resources` (tvrdá ekonomika), nebo jen warning v UI bez reálného odběru zatím?
2. **Migration cap** — 5% populace/turn je agresivní. Chceš spíše 1-2%, nebo necháváš na 5%?
3. **Heritage seed** — mám hardcodovat efekty per lineage_kind (např. "námořníci/horalé/pastevci") nebo nechat AI generovat efekty při bootstrap?

Po tvém schválení a odpovědi na otázky implementuji vše ve výchozím režimu.
