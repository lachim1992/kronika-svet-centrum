## Co je na obrázku
Panel **„Stav obchodních tras"** (`RouteStatePanel.tsx`) zobrazuje **fyzické cesty mezi nody** (`province_routes`) — silnice, jejich údržbu, blokace a tlačítko investice 50g/+30%. **Není to** to samé co peer-to-peer obchodní dohody mezi hráči (`trade_routes` / `trade_offers`) ani to samé co **trade systems** (autopočítané souvislé komponenty cest přes Union-Find v `compute-trade-systems`).

Termín se mate. Tento plán to sjednotí.

## Proč nejdou navazovat obchodní cesty
1. **`CityActionsPopover` → „Vytvořit obchodní route"** jen otevře `TradePanel`, ale ten dělá pouze P2P **trade_offers** (požaduje, aby cizí město mělo vlastníka — neutrály jsou ignorovány v `otherCities`).
2. **„Žádost o obchodní přístup"** zapíše `diplomatic_treaties` se `status='pending'`, ale **neexistuje protistrana, která by to schválila** — `WorldFeedPanel`/`EventDetailModal` dnes Accept/Decline tlačítka pro `trade_access_requested` nemají. Žádost tedy nikdy nepřejde do `active`.
3. Pro **neutrální města** neexistuje žádný flow vůbec — tlačítka v popoveru jsou zablokovaná podmínkami `!isOwn && !isNeutral`.
4. `compute-trade-systems` projektuje access jen z **ownership**, **discovery (visible)** a **active treaties**. Nikdy z „pending".

## Vize trade systémů — cílový stav

```
[Můj systém]──silnice──[Neutrální Liga]──silnice──[Cizí systém]
        \_________ Trade Union deklarace _________/
                     (vzdálené spojení)
```

- **Připojení neutrála** = postavit `province_route` k jeho nodu **+ jednorázový tribut** podle úrovně osídlení. Po dokončení neutrál vstoupí do mé komponenty.
- **Spojení dvou hráčských systémů** = nový diplomatic treaty typ **`trade_union`**. Manuálně podepsaný, dva systémy se tváří jako jeden (sdílený access, sdílený flow), nezávisle na fyzické cestě.
- **Důležitá města** = nody s vysokou **betweenness centrality** (kolik flow paths přes ně jde) získají bonus k wealth a vizuální „Trade Hub" pulse.

---

## Plán implementace (fáze)

### Fáze 1 — Sjednocení terminologie (UI only)
- Přejmenovat `RouteStatePanel` → **„Infrastruktura: Silnice a cesty"**, badge ikona = silnice.
- V `TradePanel` přejmenovat „Trade routes" → **„Obchodní dohody (P2P)"**.
- V `CityActionsPopover` přejmenovat „Vytvořit obchodní route" → **„Nabídnout dohodu"** (P2P kontrakt).
- Přidat nový panel **„Trade systems"** v Realm/Economy tabu (využije existující `TradeSystemsOverlay` data + nové akce níže).

### Fáze 2 — Připojení neutrálního města (Hybrid: silnice + tribut)
- **DB migrace:** rozšířit `diplomatic_treaties` o `trade_union` a přidat tabulku `neutral_trade_pacts` (session_id, neutral_node_id, player_name, tribute_paid, signed_turn, status).
- **`CityActionsPopover` pro neutrály:** nové tlačítko **„Připojit do mého trade systému"**, cena = `f(settlement_level)` (50/100/200g) + požadavek: musí existovat dokončená `province_route` z mého nodu k jeho.
  - Když silnice neexistuje → tlačítko disabled s textem „Nejprve postavte cestu k tomuto městu" + zkratka „Naplánovat cestu" → otevře `WorldMapBuildPanel`.
  - Když existuje → konfirm dialog s tributem → INSERT do `neutral_trade_pacts` + odečet zlata + dispatch `CONNECT_NEUTRAL_TO_SYSTEM` command.
- **`compute-trade-systems` upgrade:** při projektaci access přečíst `neutral_trade_pacts (status=active)` a udělit hráči `direct` access k systémům, kde je daný neutrální nod. Případně vložit toho hráče i do `member_players` (sdílený systém).

### Fáze 3 — Spojení dvou trade systémů („Trade Union")
- **Nový treaty_type:** `trade_union` v `DiplomacyPanel` — wizard: vyber druhého hráče → 2 systémy budou sdíleny.
- **`compute-trade-systems` upgrade:** po Union-Find postupu projít aktivní `trade_union` smlouvy a udělat **virtual merge** komponent (nikoli přepsání `trade_system_id`, ale projekce do `player_trade_system_access` jako `level=open, source=union:<id>` pro oba hráče na obou systémech). Volitelně přidat sloupec `parent_union_id` pro vizualizaci „supersystému".
- **`TradeSystemsOverlay`:** systémy spojené Union dostanou stejnou barvu + tenkou propojnici mezi nejbližšími nody.

### Fáze 4 — Treaty schvalování (oprava root cause)
- **`EventDetailModal`** pro `event_type='trade_access_requested'` (a `trade_union_proposed`) zobrazí Accept/Decline:
  - Accept → `diplomatic_treaties.status='active'`, `signed_turn=currentTurn`, dispatch `ACCEPT_TREATY`, znovuspustit `compute-trade-systems`.
  - Decline → `status='rejected'`, dispatch `REJECT_TREATY`.
- Stejný flow pro `trade_union_proposed` (Fáze 3).

### Fáze 5 — Důležitá města z toku (betweenness + bonusy)
- **`compute-trade-flows`:** po vyřešení flow_paths spočítat pro každý node počet hex_path průchodů (vážený objemem) → uložit do `province_nodes.flow_centrality` (0–1 normalizováno).
- **Wealth bonus:** v `compute-economy` přidat `wealth_output *= 1 + 0.10 * flow_centrality` (cap +15%).
- **UI:** v `CityMarkerBadge` při `flow_centrality > 0.5` zobrazit zlatý pulse-ring + tooltip „Trade Hub — proudí přes vás X% obchodu". V Economy tabu nový panel **„Trade Hubs"** se žebříčkem.

### Fáze 6 — Cleanup
- Odebrat zavádějící dvojí použití slova „route" v UI (typy: `infrastructure_route` = silnice, `trade_contract` = P2P dohoda, `trade_system` = komponenta).
- Aktualizovat memory: `mem://features/economy/trade-systems-mechanics`.

---

## Technická poznámka
- **Idempotence:** všechny nové akce přes `dispatchCommand` s `command_id`.
- **Pořadí v turn pipeline:** `compute-trade-systems` musí běžet **PŘED** `compute-trade-flows`, protože flows konzumují access. Po Fázi 5 přidat krok „compute centrality" mezi flows a economy.
- **Out of scope:** Auto-merge pop-up posil v bitvě (z předchozí session — již hotovo), espionage, hexové vstupní tarify.

## Otevřené otázky
Vše vyjasněno (Hybrid neutrál / Manual Union / Betweenness+bonusy / Sjednotit terminologii).