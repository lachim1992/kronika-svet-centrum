## Audit — co dříve šlo nastavit vs. co teď wizard nabízí

### Plný registr nastavitelných polí (zdroj: MultiplayerLobby + FactionDesigner + DB schema)

DB má pro každého hráče dvě klíčové tabulky:

**`player_civ_configs`** — narativní + strukturální vstupy hráče:
- realm_name, settlement_name, people_name, culture_name, language_name
- civ_description, founding_legend
- homeland_name, homeland_biome, homeland_desc, spawn_preference
- ruler_name, ruler_title, ruler_archetype, ruler_bio
- government_form, trade_ideology, dominant_faith, faith_attitude
- heraldry (jsonb: primary, secondary, symbol)
- secret_objective_archetype
- lineage_ids (pradávné rody)

**`civ_identity`** — mechanické modifikátory + flavor (extrakce z popisu, případně ruční úprava):
- display_name, flavor_summary, culture_tags
- urban_style, society_structure, military_doctrine, economic_focus
- 5× produkce (grain/wood/stone/iron/wealth)
- 3× populace (pop_growth, burgher_ratio, cleric_ratio)
- 4× vojenství (morale, mobilization_speed, cavalry_bonus, fortification_bonus)
- 4× stabilita (stability, trade, diplomacy, research)
- **special_buildings** (jsonb), building_tags
- **militia_unit_name + _desc, professional_unit_name + _desc** ← specifické jednotky
- core_myth, cultural_quirk, architectural_style

### Co současný `WorldSetupWizard` skutečně nabízí

`CivSetupStep` v praxi pokrývá `player_civ_configs` slušně, ale s několika dírami:
- ✅ Identita (realm, settlement, people, culture, language, popis, heraldika)
- ✅ Vládce (jméno, titul, archetyp, bio)
- ✅ Domovina (název, biom, popis, spawn) — collapsed default, snadno přehlédnuto
- ✅ Vláda & víra — collapsed
- ✅ Zakládající legenda — collapsed
- ✅ Tajný cíl
- ❌ **Pradávné rody (lineage_ids)** — `LineageSelector` se renderuje jen když existuje `ancientLayer` z analýzy, a to je v hlavním sloupci pod CivSetup. V MP lobby je to dedikovaný krok wizardu, hráč to vidí. V SP je to skryté za `resolved && ancientLayer`.
- ❌ **AI Protivníci** — komponenta `AIOpponentsStep` existuje, ale renderuje se **jen `!isMPMode && resolved`** → než hráč klikne „Analyzovat premisu", neuvidí ji vůbec.
- ❌ **Faction Designer (mechanické modifikátory)** — `extract-civ-identity` se volá jen jako tlačítko ✨ uvnitř popisu, vrací jen 4 strukturální tagy v náhledu. Nikde se neukáže `CivIdentityPreview` s úpravou všech 16 modifikátorů, building_tags, **militia/professional jednotek**, special_buildings. To je přesně to, co uživatel myslí „specifické jednotky pro daný národ".
- ❌ **Special buildings** — DB sloupec existuje, AI je generuje, ale wizard je nikde nezobrazí ani neumožní úpravu.

### Co backend ignoruje

`seed-realm-skeleton.ts` při zápisu `civ_identity` posílá jen `display_name`, `flavor_summary`, `source_description`, `culture_tags`. Vše ostatní (modifikátory, jednotky, building_tags, special_buildings) zůstává na defaultech (0/prázdno), pokud hráč explicitně nezavolá `extract-civ-identity` ve wizardu nebo později v `CivTab`. 

Result: nově založená hra má hráče **bez vlastních jednotek a bez identity bonusů**, dokud není ručně přepočítáno.

## Plán — wizard musí pokrýt 100 %

### 1. Přesunout AI extrakci na konec CivSetupStep jako povinný krok

Místo malého tlačítka „✨ Extrahovat" v boxu popisu vytvořit dedikovanou collapsible sekci **„🧬 Mechanická identita & jednotky"**, která:
- Zobrazí tlačítko „Analyzovat civilizaci AI" (volá `extract-civ-identity` se VŠEMI dostupnými kontexty: civ_description, founding_legend, ruler_bio, homeland_desc, government_form, dominant_faith, culture_name).
- Po extrakci zobrazí kompletní `CivIdentityPreview` (read-only nebo s expanded modifikátory).
- **Zvlášť zvýrazní** vygenerované specifické jednotky (`militia_unit_name/desc`, `professional_unit_name/desc`) jako edituovatelné inputy s tlačítkem „🔁 Vygenerovat znovu".
- Zvlášť zobrazí `building_tags` jako Badge seznam s možností hráčem doplnit/odebrat.
- Bez tohoto kroku půjde založit hru jen s upozorněním „Frakce nemá vlastní jednotky — chcete pokračovat?" (varování, ne blokace).

State: `extractedIdentity` držet ve `WorldSetupWizard`, předat dolů. Při submitu poslat do `composeBootstrapFromSpec` jako nové pole `identityModifiers`.

### 2. Pradávné rody (Lineage) zařadit i pro SP

Aktuálně `<LineageSelector />` se renderuje uvnitř `{resolved && ancientLayer && ...}`. To je správně (potřebujeme ancient_layer z analýzy), ale:
- Přesunout vizuálně **pod** `CivSetupStep` jako vlastní karta s jasným titulkem „🧬 Pradávné dědictví (vyber rody)".
- Když ještě není `ancientLayer`, místo skrytí ukázat placeholder „Po analýze premisy vyber, ke kterým pradávným rodům se hlásíš."
- `selectedLineages` už ve state existuje, jen ho propsat do `player_civ_configs.lineage_ids` přes seed-realm-skeleton (zatím netoto persisted v SP).

### 3. AI Protivníci — vždy viditelné

`AIOpponentsStep` přesunout mimo `{resolved && ...}` blok.
- Když ještě není `resolved`, ukázat hlášku „Po analýze premisy se zobrazí seznam protivníků (počet upravíš v sekci Detailní úpravy)."
- Po analýze rovnou vyplnit slidery + flavor.
- **Přidat** pro každého AI protivníka stejný „🧬 Analyzovat AI civilizaci" tlačítko, které lokálně přes `extract-civ-identity` vytáhne flavor (mechaniku není třeba — engine to dovolá při bootstrapu z description).

### 4. Backend — propsat hráčovu mechanickou identitu do bootstrapu

V `seed-realm-skeleton.ts`:
- Přijmout volitelný `identityModifiers` payload.
- Při upsertu `civ_identity` přepsat výchozí prázdné hodnoty extrakcí z wizardu (display_name, flavor_summary, urban_style, society_structure, military_doctrine, economic_focus, všech 16 modifikátorů, building_tags, special_buildings, militia_unit_*, professional_unit_*, core_myth, cultural_quirk, architectural_style).
- Persistovat `lineage_ids` do `player_civ_configs` (dnes v SP větvi není upserted vůbec, jen v MP přes lobby).
- Pro AI frakce: pokud má `aiFaction.description` ≥ 30 znaků, **automaticky zavolat `extract-civ-identity`** v rámci bootstrapu (per-faction), aby každá AI frakce měla své vlastní jednotky a modifikátory. Bez popisu nechat defaulty.

### 5. Předat do generátoru kronik

`world-generate-init` (a Chronicle Zero pipeline):
- Do promptu přidat sekci „IDENTITA HRÁČŮ" s pro každou frakci: name, ruler, government, faith, militia_unit_name, professional_unit_name, special_buildings, core_myth, founding_legend.
- Tím AI utká prehistorii a první kroniku tak, že **použije konkrétní jména jednotek a budov** místo generického „vojska". To je jádro flavoru, který uživatel postrádá.

### 6. Validace + UX

`civValid` rozšířit o varování (ne blokace) když `extractedIdentity` neexistuje. Jasná žlutá hláška: „⚠️ Tvá civilizace nemá AI-vygenerované jednotky a modifikátory. Doporučujeme analyzovat (sekce „Mechanická identita & jednotky"). Bez toho budou ve hře používány obecné názvy."

Tlačítko „Vytvořit svět" zůstává odblokované, ale s varovnou ikonou pokud chybí extrakce.

## Soubory k úpravě

- **Edit**: `src/components/world-setup/CivSetupStep.tsx` — nová sekce „🧬 Mechanická identita & jednotky" (CivIdentityPreview embedded, militia/professional inputs, building_tags badges). Volá `extract-civ-identity` s plným kontextem. Vrací `extractedIdentity` přes nový prop callback.
- **Edit**: `src/components/WorldSetupWizard.tsx` — držet `extractedIdentity` state, vždy viditelné `AIOpponentsStep`, vždy viditelná Lineage karta (placeholder když chybí ancient_layer). Předat `extractedIdentity` a `selectedLineages` do bootstrap payloadu.
- **Edit**: `src/types/worldBootstrap.ts` + `src/lib/worldBootstrapPayload.ts` — rozšířit `CreateWorldBootstrapRequest` o `identityModifiers?` a `lineageIds?` pole pro hosta, plus per-faction `identityHint` možnost.
- **Edit**: `supabase/functions/_shared/seed-realm-skeleton.ts` — upsert plné `civ_identity` z `identityModifiers`, persist `lineage_ids` do `player_civ_configs` (SP větev), per-AI-frakce volat `extract-civ-identity` při dostatečně dlouhém popisu.
- **Edit**: `supabase/functions/world-generate-init/index.ts` — do promptu přidat sekci s konkrétními jednotkami a budovami pro všechny hráče.
- **Edit**: `src/components/world-setup/AIOpponentsStep.tsx` — pridat tlačítko „✨ Vygeneruj flavor" per frakci (volitelné, lokální AI volání).

## Co tím dostaneš

- Hráč VIDÍ a může upravit vše, co dříve zadával — identita, vládce, domovina, vláda, víra, heraldika, legenda, tajný cíl, pradávné rody, **specifické jednotky (milice + profesionálové), speciální budovy**, mechanické modifikátory.
- Pradávné rody jsou viditelné jako vlastní karta i v SP módu.
- AI Protivníci nejsou skrytí za analýzou, mají vlastní flavor a (v bootstrapu) vlastní extrakci jednotek.
- Po vytvoření světa má každá frakce v DB plně vyplněné `civ_identity` včetně názvů jednotek — Chronicle Zero a další AI generátory je použijí v textu.
- Vznikne historie a svět tak, jak to bylo dřív — s konkrétními jmény, ne generickým „vojskem".

Po schválení implementuji.