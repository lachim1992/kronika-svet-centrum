## Co se změní

### 1. Anektovat — přejmenování v post-battle modalu (rychlá UI úprava)
- V `PostBattleDecisionModal.tsx` přejmenovat tlačítko/labelu **„Okupovat město"** → **„Anektovat (5 kol → trvalé)"**.
- Přidat krátký popisek: „Po 5 tazích bez osvobození se město trvale stane vaším."
- Mechanika zůstává beze změny (řízeno `liberation_deadline` v `commit-turn`).

---

### 2. AI musí stavět silnice, anektovat neutrální uzly a navazovat obchody
Aktuálně AI tah (`ai-faction-turn`) prakticky neřeší infrastrukturu. Doplníme tři nové akce do AI rozhodovacího jádra a do whitelistu příkazů:

- **`BUILD_ROAD`** — AI hodnotí vlastní uzly a sousední neobchodované cíle (vlastní města, spojenecké uzly, neutrální uzly s vysokou hodnotou) a zakládá projekt cesty (přes existující `START_PROJECT` typu `build_route`, nově s alokací pracovní síly — viz bod 3).
- **`CLAIM_NEUTRAL_NODE`** — AI při průchodu/blízkosti neutrálního uzlu spustí `command-dispatch CLAIM_NODE` (případně `EXPLORE_NODE` pokud uzel ještě není odkrytý) a uzel přidá do svého ekonomického systému.
- **`ESTABLISH_TRADE`** — AI vyhodnocuje deficitní baskety (z `city_market_baskets`) a posílá nabídky obchodu sousedům (přes existující `PROPOSE_TRADE` / `CREATE_TRADE_ROUTE`).

Heuristika běží v `supabase/functions/ai-faction-turn/index.ts` jako součást deterministického kroku **před** voláním Gemini (LLM smí akce schválit/odmítnout, ne vymyslet jiné). Limity: max 1 nová silnice + 2 trade nabídky + neomezené claim za tah na frakci, kapacita peasantů a goldu se kontroluje.

### 3. Sjednocená mechanika stavby silnic — pracovní síla na hex
Nahrazujeme staré pevné `turns: 3` z `PROJECT_COSTS.build_route` modelem alokace pracovní síly, identickým pro AI i hráče.

**Pravidlo:**
- Cena = **25 pracovní síly (workforce) × počet hexů cesty**.
- Hráč/AI při založení projektu zvolí, kolik **workforce alokuje za tah** (min 5, max = vlastní disponibilní peasantská kapacita).
- Každý tah se z alokace odečte z dostupné workforce hráče a přičte se k `progress` projektu.
- Projekt skončí, když `progress ≥ total_workforce_required`.
- UI ukazuje: „Cesta 3 hexy → 75 pracovní síly. Při alokaci 25/tah → hotovo za 3 tahy."

**Konkrétní změny:**
- DB migrace `construction_projects`: nové sloupce `workforce_total INT`, `workforce_per_turn INT`, `workforce_progress INT`. Default values pro existující řádky odvodit z `turns_remaining * 25`.
- `START_PROJECT` v `command-dispatch` (typ `build_route`): vypočítá délku cesty (počet hexů z A* mezi node_a a node_b) → `workforce_total = 25 × hex_count`. Příkaz akceptuje `workforcePerTurn` (default 25).
- Nové příkazy: `ADJUST_PROJECT_WORKFORCE` (změna alokace za tah na běžícím projektu) + `CANCEL_PROJECT` (existuje, beze změny).
- `process-turn` (fáze 5: graph/projects): nahradit dekrement `turns_remaining` přičtením `workforce_per_turn` k `workforce_progress` a odečtením z `peasants_available` (přes `realm_resources` / labor pool). Dokončení = `workforce_progress ≥ workforce_total`.
- Frontend `WorldMapBuildPanel.tsx` (a karta projektu, kde existuje): slider „Kolik pracovní síly alokovat / tah" + náhled „Hotovo za N tahů".
- AI heuristika v bodě 2 vždy alokuje **25/tah** (nejlevnější varianta) pokud má frakce ≥ 30 % volné kapacity, jinak projekt nezakládá.

---

## Pořadí implementace
1. **DB migrace** `construction_projects` (nové sloupce + backfill).
2. **`command-dispatch`** — handler `START_PROJECT` (workforce model), nový `ADJUST_PROJECT_WORKFORCE`, nové AI příkazy `CLAIM_NEUTRAL_NODE` (mapuje na `CLAIM_NODE`).
3. **`process-turn`** — fáze projektů přepsaná na workforce.
4. **`ai-faction-turn`** — heuristika `BUILD_ROAD` + `CLAIM_NEUTRAL_NODE` + `ESTABLISH_TRADE`.
5. **`PostBattleDecisionModal.tsx`** — UI přejmenování (rychlé).
6. **`WorldMapBuildPanel.tsx`** + případné karty projektu — workforce slider, nový náhled.
7. **Frontend `strategicGraph.ts`** — vystavit `workforcePerTurn` u `startProject` a nový helper `adjustProjectWorkforce`.

## Co se NEMĚNÍ
- Ekonomika ostatních projektů (fort, port, hub) — zůstávají na starém `turns` modelu (pokud chceš sjednotit i je, řekni).
- Liberation/annexation 5-tahový mechanismus.
- AI Gemini orchestrace — pouze přidáme deterministické akce; LLM hraje stejnou roli jako dosud.
