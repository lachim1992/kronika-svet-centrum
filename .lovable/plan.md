## Diagnóza — proč to "tam pořád není"

Podle screenshotu jsi v módu **👥 Multiplayer** a scrolluješ úvodním wizardem (`WorldSetupWizard`). V kódu je `CivSetupStep` schovaný hned ze dvou důvodů:

1. **Renderuje se jen pro non-MP módy** — `{!isMPMode && <CivSetupStep ... />}`. V MP byl plán, že identitu řeší až `MultiplayerLobby` po vytvoření hry. Jenže ty jsi chtěl flavor **při zakládání**, takže to schovávání je špatně.
2. **Renderuje se až po analýze premisy** — celý blok je uvnitř `{resolved && (…)}`. Dokud nestiskneš "Analyzovat premisu", nevidíš ani identitu, vládce, heraldiku, legendu — vůbec nic. Tvůj screenshot je přesně ten stav: premisa prázdná → nikde nic.
3. **V MP wizardu není vůbec předán** — i kdyby se zobrazil, MP větev v `handleSubmit` payload identity neposílá do `mp-world-generate`.

## Plán opravy

### 1. Civ sekce viditelná **vždy**, nezávisle na analýze
Přesunout `<CivSetupStep>` ven z `{resolved && …}` bloku. Identita (jméno říše, vládce, heraldika, legenda, tajný cíl) je o **hráči**, ne o blueprintu — nemusí čekat na AI návrh světa. Hráč ji může vyplňovat paralelně s tím, co píše premisu.

Nové uspořádání:

```text
Herní režim
Vaše jméno
Inspirace (volitelné)
Premisa světa  + [Analyzovat]
Premisa Pradávna
─────────────── (po analýze) ───────────────
[Spec review / SchematicMap / SpecFieldEditor / AdvancedTerrain]
─────────────── (vždy, hned pod premisou) ──
🏰 Tvá civilizace  ← CivSetupStep (vždy zobrazené)
   • Identita říše + heraldika
   • Vládce
   • Domovina + spawn (jen single/manual)
   • Vláda & víra
   • Zakladatelská legenda + ✨ Vygeneruj z premisy
   • Tajný cíl
─────────────────────────────────────────────
[Vytvořit svět]
```

### 2. Zobrazit `CivSetupStep` i v Multiplayer módu
Odstranit guard `!isMPMode`. V MP je tohle host nastavení vlastní civilizace; ostatní hráči si stejnou sekci doplní v `MultiplayerLobby` (ten zůstává, jen místo prázdného hostova řádku už bude předvyplněný).

### 3. Předat identity do MP bootstrap pipeline
V `handleSubmit` MP větve (`mp-world-generate` invocation v `WorldSetupWizard`) přibalit `identity` payload jako "host civ config" — uložit do `player_civ_configs` pro hosta při zakládání session, aby AI generátor a lobby měli odkud číst.

### 4. Validace bez blueprintu
Dnes "Vytvořit svět" potřebuje `resolved` (blueprint po analýze) → to je správně, blueprint pořád musí existovat. Civ pole zůstávají povinná (`civValid`) jako dnes — jen už nejsou schovaná, takže hráč je opravdu vyplní.

### 5. Drobnost: pre-fill vládce z `playerName`
Když hráč napíše svoje jméno nahoře a zatím nezadal `rulerName`, defaultně ho použít jako návrh (přepisovatelný). Zlepšuje UX, dnes to nutí psát jméno dvakrát.

## Soubory k úpravě

- `src/components/WorldSetupWizard.tsx` — přesun `<CivSetupStep>`, odstranění `!isMPMode` guardu, předání `identity` do MP větve `handleSubmit`, default `rulerName` z `playerName`.
- `supabase/functions/mp-world-generate/index.ts` — přijmout volitelný `hostIdentity` payload a zapsat řádek do `player_civ_configs` pro hostitele (stejnou cestou jako lobby zápisy).
- `src/types/worldBootstrap.ts` — pokud `mp-world-generate` request type neobsahuje `hostIdentity`, doplnit.

## Co tím dostaneš

- Civ-flavor sekce viditelná **okamžitě po otevření wizardu**, ve všech módech (AI Svět, Ruční, Multiplayer).
- Hráč může vyplňovat premisu i identitu paralelně, nemusí čekat na analýzu.
- V MP je hostova civilizace uložená rovnou při zakládání hry, ne až v lobby.
- Žluté varování "doplň jméno říše, vládce, tajný cíl" se objeví hned, takže je jasné, co chybí.

Po schválení implementuji.