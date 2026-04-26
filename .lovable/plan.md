## Problém

V MP lobby (`MultiplayerLobby.tsx`) hráč při zakládání civilizace nastavuje pouze **3 minimální kroky**:

1. **Identita** — název říše, název sídla, lid, kultura, jazyk, popis civilizace
2. **Provincie** — název domoviny, biom, popis krajiny
3. **Frakce** — `FactionDesigner` (modifikátory z popisu)

To je výrazně **méně, než nabízí singleplayer wizard** (`WorldSetupWizard`) a než systém umí na úrovni civilizace plně použít. V důsledku toho hráč v MP nemá vliv na řadu věcí, které pak existují ve hře (tajné cíle, vyhlášení, traits, vítězný styl, lineage z Pradávna, vlajka/heraldika atd.) a které MP svět **stejně generuje**, ale bez vstupu hráče → vznikají náhodně, nebo nevznikají vůbec.

## Co aktuálně chybí v MP lobby (audit existujících systémů)

Procházím dnešní entity, kterým hráč/civilizace má/může v `Default` modu vlastnit data, a porovnávám s tím, co MP lobby vystavuje:

| Oblast | SP wizard / engine ji řeší | MP lobby ji řeší | Status |
|---|---|---|---|
| Premise světa | ✅ premise + Pradávno + AI analyze | ❌ vidí jen čtení `world_foundations` | **chybí** (host už to nastavil mimo lobby přes WorldSetupWizard, ale spoluhráči to nevidí editovatelně) |
| Tón / vítězný styl | ✅ ze SpecReviewSummary | ❌ pouze readonly v collapsible | OK (host, ostatní jen vidí) |
| Identita říše (jména) | ✅ | ✅ | OK |
| Provincie + biom | ✅ + `homeland_desc` | ✅ částečně | OK |
| Faction modifikátory | ✅ via FactionDesigner | ✅ | OK |
| **Vládce / vůdce** (jméno, titul, archetyp, krátký bio) | ❌ generováno AI | ❌ | **chybí** — vládce je pak generován náhodně v `mp-world-generate` |
| **Vlajka / barvy / heraldika** | ❌ | ❌ | **chybí** — frakce v MP nemají vizuální identitu, jen iniciálu a primární barvu |
| **Vládní forma / režim** (monarchie/republika/teokracie/oligarchie/kočovný kmen) | ⚠️ implicitně přes FactionDesigner traits | ❌ explicitně | **chybí** — ovlivňuje legitimitu, dekrety, dědictví |
| **Civilizační identita / DNA** (Urbanismus, Společnost, Doktrína, Ekonomika dle `mem://features/civilization-identity/core-mechanics`) | ⚠️ odvozeno z popisu | ⚠️ odvozeno přes `civ_identity` extract | OK ale neviditelné — hráč nevidí preview *před* startem |
| **Obchodní ideologie** (Volný trh / Cechy / Palác — `mem://features/economy/trade-ideology-mechanics`) | ❌ default | ❌ | **chybí** — má mechanické dopady |
| **Startovní traits** (`entity_traits` u říše/města/vládce) | ⚠️ generuje engine | ❌ | **chybí** — hráč nemá kontrolu nad počátečním "DNA" |
| **Lineage z Pradávna** (vazba civilizace na ancient layer — `LineageSelector`) | ✅ v SP | ❌ úplně chybí | **chybí** — MP svět generuje ancient_layer, ale hráč si k němu nepřiřadí lineage |
| **Tajný cíl / secret objective** (`SecretObjectivesPanel`) | ⚠️ AI generuje on-start | ❌ | **chybí volba** — hráč nemůže vybrat archetyp cíle (dobyvatel/obchodník/věštec) |
| **Náboženství / víra** (`mem://features/economy/faith-system-impact`) | ⚠️ implicitní | ❌ | **chybí** — pantheon, dominantní kult, postoj k cizím vírám |
| **Startovní bonus / handicap** (premiové vs. challenge starty) | ❌ | ❌ | **chybí** — žádná možnost říct "začínám s Arénou" / "začínám v exilu" |
| **Sousedství / preferovaná startovní oblast** (mód spawn) | ⚠️ engine | ❌ | **chybí** — hráč nevidí kde na mapě bude spawnovat ani nemůže preferovat region (sever/jih, pobřeží/vnitrozemí) |

## Plán implementace

Rozšířím MP lobby wizard ze **3 kroků na 6 kroků**, sjednotím s tím, co engine už umí, a propojím s existujícími tabulkami. Žádné nové simulační mechaniky — pouze **vystavuju to, co už existuje, hráči ve fázi setupu**.

### Krok A — Rozšíření UI v `MultiplayerLobby.tsx`

Wizard kroky (nové pořadí):

```text
1. Identita      (existuje — kosmetický cleanup)
2. Vládce        (NOVÝ — jméno, titul, archetyp, krátký bio)
3. Domovina      (existuje + spawn preference: sever/jih/východ/západ/pobřeží/vnitrozemí)
4. Vláda & víra  (NOVÝ — vládní forma, obchodní ideologie, dominantní víra/pantheon)
5. Lineage       (NOVÝ — výběr napojení na Pradávno; viditelné jen pokud session má ancient_layer)
6. Frakce + DNA  (existuje — FactionDesigner + živý CivIdentityPreview okamžitě po Generate)
7. Tajný cíl     (NOVÝ — výběr archetypu z 4-5 možností; finální cíl AI doplní text při startu)
```

Heraldika (vlajka/barvy) integruju **do kroku 1 (Identita)** — color picker pro primary/secondary + symbol z palety (kruh/kříž/zvíře/runa) → uloží se do `player_civ_configs.heraldry` (jsonb).

### Krok B — Datový model

Rozšíření `player_civ_configs` o nové sloupce (jeden migration):

```sql
ALTER TABLE player_civ_configs
  ADD COLUMN IF NOT EXISTS ruler_name      text,
  ADD COLUMN IF NOT EXISTS ruler_title     text,
  ADD COLUMN IF NOT EXISTS ruler_archetype text,    -- 'warrior'|'sage'|'merchant'|'priest'|'tyrant'|'diplomat'
  ADD COLUMN IF NOT EXISTS ruler_bio       text,
  ADD COLUMN IF NOT EXISTS government_form text,    -- 'monarchy'|'republic'|'theocracy'|'oligarchy'|'tribal'|'magocracy'
  ADD COLUMN IF NOT EXISTS trade_ideology  text,    -- 'free_market'|'guilds'|'palace_economy'
  ADD COLUMN IF NOT EXISTS dominant_faith  text,    -- volný text (např. "Kult Slunce")
  ADD COLUMN IF NOT EXISTS faith_attitude  text,    -- 'tolerant'|'syncretic'|'orthodox'|'militant'
  ADD COLUMN IF NOT EXISTS spawn_preference text,   -- 'north'|'south'|'east'|'west'|'coast'|'inland'|'any'
  ADD COLUMN IF NOT EXISTS lineage_ids     text[],  -- výběr z ancient_layer.lineage_candidates
  ADD COLUMN IF NOT EXISTS secret_objective_archetype text, -- 'conqueror'|'merchant_prince'|'prophet'|'librarian'|'kingmaker'
  ADD COLUMN IF NOT EXISTS heraldry        jsonb DEFAULT '{}'::jsonb; -- {primary,secondary,symbol}
```

Vše idempotentní (`IF NOT EXISTS`) — v souladu s pojistkou A0 z aktuálního plánu Consolidation v4.

### Krok C — Napojení na `mp-world-generate`

V `mp-world-generate/index.ts` (sekce kde se generují vládci, frakce, traits, secret objectives, ancient lineage mapping) **prefill-uju** hráčské volby místo náhodného AI generování:

- `ruler_*` → uloží se do `civ_identity.rulers` a do počátečního `entity_traits` rulera
- `government_form` + `trade_ideology` → uloží se do `civ_identity.modifiers` jako trvalé modifiery
- `dominant_faith` + `faith_attitude` → seed pro `realm_resources.faith` baseline a `entity_traits` na úrovni říše
- `spawn_preference` → vstup pro spawn allocator (preference, ne hard constraint)
- `lineage_ids` → namapováno na `ancient_layer.selected_lineages` per-player
- `secret_objective_archetype` → vstup pro AI generátor `secret_objectives` (AI vygeneruje konkrétní text v rámci archetypu)
- `heraldry` → uloží se do `civ_identity.visual` a používá se v UI místo iniciály

### Krok D — Live preview

Po dokončení kroku 6 (FactionDesigner) zobrazím **`CivIdentityPreview` přímo v lobby** (už je tam pro readonly state — rozšířím o stav "configuring" s tlačítkem "Vygenerovat náhled identity") tak, aby hráč okamžitě viděl extrahované modifiery DNA před tím, než klikne "Připraven".

### Krok E — Validace „integrované, kurva"

Ošetření že MP a SP používají **stejné kontrakty**:

- Audit `mp-world-generate` vs. `create-world-bootstrap`: oba čtou stejné `world_foundations` + nově `player_civ_configs` rozšířené sloupce.
- Sjednotit, že každá hráčská civilizace v MP projde stejným pipeline jako AI frakce v SP (`ai-faction-turn` kontrakt) — žádné zkratky.
- Pokud hráč nevyplní nový krok, zachová se dnešní AI default (zpětná kompatibilita).

## Soubory ke změně

**Nová migrace:**
- `supabase/migrations/<ts>_extend_player_civ_configs.sql` — nové sloupce (idempotent)

**Frontend:**
- `src/components/MultiplayerLobby.tsx` — rozšíření wizardu z 3 na 7 kroků, heraldika picker, spawn preference, lineage UI (podmíněně)
- `src/components/MultiplayerLobby/RulerStep.tsx` (nový subkomponent)
- `src/components/MultiplayerLobby/GovernmentFaithStep.tsx` (nový)
- `src/components/MultiplayerLobby/LineageStep.tsx` (nový — re-use `LineageSelector` ze SP)
- `src/components/MultiplayerLobby/SecretObjectiveStep.tsx` (nový)
- `src/components/MultiplayerLobby/HeraldryPicker.tsx` (nový)

**Backend:**
- `supabase/functions/mp-world-generate/index.ts` — čtení nových polí + jejich aplikace v sekcích: rulers, civ_identity, traits seed, ancient lineage mapping, secret objectives, realm_resources faith baseline, frakce visual

## Důležité poznámky

- **Heraldika** = lehký SVG generátor (color × symbol), žádná AI generace obrázku ve fázi setupu. AI obrázek vlajky se případně vygeneruje až po startu světa přes `wiki-orchestrator` (regenerate fields:['image']) v souladu s policy z `mem://features/chrowiki/orchestrator-gateway`.
- **Lineage krok** se zobrazí pouze pokud `world_foundations` má `ancient_layer` jsonb naplněný (host povolil Pradávno v SP wizardu). Jinak krok přeskočíme.
- **Bez nových mechanik** — pouze vystavuju existující dimenze. Engine už umí government_form (přes traits), trade_ideology (mem://), faith (mem://), lineage (SP wizard), secret_objectives (panel), heraldry (frakce mají primary_color).
- **Zpětná kompatibilita**: existující MP relace bez nových polí dál fungují (nové sloupce mají default nebo NULL → fallback na dnešní AI generování).