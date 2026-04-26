## Co se právě děje při zakládání hry

Tvůj svět **D3WVST** je `tb_single_ai` — single-player s AI. Současný `WorldSetupWizard` má bohaté nastavení **světa** (premisa, Pradávno, ancient layer, terén, lineage, faction count), ale identita **hráčovy civilizace** je tam absurdně chudá:

- ✅ máš: jméno hráče, premisa, tón, vítězství, pradávno, lineage, terén
- ❌ chybí: jméno říše, jméno startovního sídla, kultura/jazyk, popis civilizace, **vládce** (jméno, titul, archetyp, bio), forma vlády, obchodní ideologie, dominantní víra, **heraldika**, **tajný cíl** (secret objective), **zakladatelská legenda** (founding myth)

Tohle všechno už **existuje pro multiplayer** (`MultiplayerLobby` má 7-krokový civ wizard + komponenty `RulerStep`, `GovernmentFaithStep`, `SecretObjectiveStep`, `HeraldryPicker`, `SpawnPreferencePicker`, `FactionDesigner`, `CivIdentityPreview`). Single-player ten samý flavor postrádá → AI si všechno vymyslí a hráč nemá pocit vlastnictví své civilizace.

## Plán

### 1. Sjednotit civ-setup mezi SP a MP

Vytvořit sdílený krok **„Tvá civilizace"** který se vloží do `WorldSetupWizard` (single + manual módy) **mezi „Pradávno/Lineage"** a **„Vytvořit svět"**. V multiplayeru se stejné komponenty používají dál v `MultiplayerLobby` beze změny.

**Nový soubor `src/components/world-setup/CivSetupStep.tsx`** — kompozice existujících sub-komponent + extrakce z dnešního MP wizardu:

```
┌─ Identita říše ────────────────────────────┐
│ • realm_name, settlement_name              │
│ • people_name, culture_name, language_name │
│ • civ_description (textarea, AI hint)      │
│ • HeraldryPicker (barvy + symbol)          │
├─ Vládce ───────────────────────────────────┤
│ RulerStep: name, title, archetype, bio     │
├─ Domovina (jen SP) ────────────────────────┤
│ • homeland_name, homeland_biome            │
│ • homeland_desc                            │
│ • SpawnPreferencePicker                    │
├─ Vláda & víra ─────────────────────────────┤
│ GovernmentFaithStep                        │
├─ Zakladatelská legenda (NOVÉ) ─────────────┤
│ founding_legend (textarea 800 znaků):      │
│ "Jak vznikla naše říše? Kdo byl první     │
│ vládce? Jaký skutek založil tradici?"     │
│ → s tlačítkem „✨ Vygeneruj z premisy"     │
├─ Tajný cíl ────────────────────────────────┤
│ SecretObjectiveStep                        │
└────────────────────────────────────────────┘
```

Kolapsibilní subsekce, takže to nezahltí. Validace: `realm_name`, `settlement_name`, `ruler_name`, `secret_objective_archetype` jsou povinné.

### 2. Rozšířit DB & payload

**Migrace** — přidat sloupec do `player_civ_configs`:
- `founding_legend text` (nullable, 800 znaků limit přes triggér)

**`src/lib/worldBootstrapPayload.ts`** — rozšířit `WizardIdentityInput`:
```ts
realmName, settlementName, peopleName, cultureName, languageName, civDescription,
homelandName, homelandBiome, homelandDesc,
rulerName, rulerTitle, rulerArchetype, rulerBio,
governmentForm, tradeIdeology, dominantFaith, faithAttitude,
spawnPreference, heraldry, secretObjectiveArchetype, foundingLegend
```

**`create-world-bootstrap`** edge funkce:
- v `seedRealmSkeleton` ukládat realm_name, ruler_*, government_form do `civilizations` + `civ_identity` (řádek 350-354 už čte realmName/cultureName/settlementName, jen rozšířit)
- pro single-player navíc: zapsat řádek do `player_civ_configs` aby `mp-world-generate`-style flavor data byla taky pro SP konzistentní (tabulka už existuje, jen ji SP nepoužívá)
- vytvořit prázdný `civ_identity` řádek se source_description=civDescription, aby `extract-civ-identity` měl odkud startovat

### 3. AI extrakce identity inline ve wizardu

V kroku „Tvá civilizace" tlačítko **„✨ Vygeneruj modifikátory frakce"** zavolá existující `extract-civ-identity` edge funkci (stejně jako MP/CivilizationDNA), zobrazí výsledek v `CivIdentityPreview`. Nepovinné — jen pro hráče co chtějí vidět co AI nasimuluje.

### 4. Propsat founding_legend do narrative pipeline

V `world-generate-init` (single-player AI generátor) předat `foundingLegend` do prompt builderu:
- chronicle zero & pre-history musí na founding_legend navázat (vládce v legendě = jedna z `legendary_persons` v generated_world)
- ruler_name z wizardu se zapíše jako první vládce v `civilizations.first_ruler_name`

### 5. Přepoužití komponent (žádná duplikace)

| Komponenta | Současné použití | Po refaktoru |
|---|---|---|
| `RulerStep` | MP lobby | MP lobby + SP wizard |
| `GovernmentFaithStep` | MP lobby | MP lobby + SP wizard |
| `SecretObjectiveStep` | MP lobby | MP lobby + SP wizard |
| `HeraldryPicker` | MP lobby | MP lobby + SP wizard |
| `SpawnPreferencePicker` | MP lobby | MP lobby + SP wizard |
| `CivIdentityPreview` | MP lobby + CivilizationDNA | beze změny + SP wizard |
| **`CivSetupStep` (nové)** | — | SP wizard (kompozice výše) |

MP `MultiplayerLobby` zůstává funkčně beze změny (jen volitelně může později používat `CivSetupStep` jako celek místo vlastního stepperu — mimo scope této iterace).

## Co tímhle dostaneš

- V single-playeru pojmenuješ říši, vládce, zvolíš heraldiku a tajný cíl **před** generováním světa
- Napíšeš zakladatelskou legendu, která se promítne do prehistorie a Chronicle Zero
- AI extrakce frakčních modifikátorů (bonusy k surovinám, vojsku) je dostupná i v SP
- Identita je konzistentně uložená v `player_civ_configs` + `civ_identity` + `civilizations` pro oba módy

## Mimo scope této iterace

- Přepis MP wizardu na sdílený `CivSetupStep` (funguje, později sjednotit)
- Backfill existujících světů (D3WVST) — pro nový svět od příštího založení
- Per-frakční heraldika pro AI frakce (zatím jen hráč)

Po schválení rovnou implementuji.