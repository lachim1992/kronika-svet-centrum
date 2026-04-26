## Diagnóza — chybí nastavení AI protivníků

V současné podobě wizardu hráč:
- **Vidí** počet AI frakcí (`factionCount` slider v `SpecFieldEditor`),
- ale **nevidí ani neupravuje jednotlivé AI protivníky** (jméno, archetyp osobnosti, popis/flavor).

V `WorldSetupWizard.tsx` (řádky 304–309) se AI frakce při bootstrap generují generickým loopem:

```ts
const factionsArr = resolved.factionCount > 0 && mode !== "tb_multi"
  ? Array.from({ length: resolved.factionCount }).map((_, i) => ({
      name: `AI Frakce ${i + 1}`,
      personality: ["aggressive", "diplomatic", "mercantile", "isolationist", "expansionist"][i % 5],
    }))
  : undefined;
```

Hráč tedy nemá šanci nastavit, KDO jsou jeho protivníci. To je flavor díra, kterou ze starší verze hry znal.

Druhý problém: v konzoli teče React warning *"Function components cannot be given refs"* z `SpawnPreferencePicker` a `GovernmentFaithStep`, protože je `Collapsible` (Radix) obaluje a posílá jim ref. Není to crash, ale stojí za opravu při téhle úpravě.

## Plán opravy

### 1. Nový komponent `AIOpponentsStep`

`src/components/world-setup/AIOpponentsStep.tsx` — sekce ve wizardu pod `CivSetupStep`, která:

- Zobrazí seznam AI protivníků v délce `resolved.factionCount` (sleduje slider z `SpecFieldEditor`).
- Pro každého nabídne:
  - **Jméno frakce** (text input, default `AI Frakce N` → editovatelné)
  - **Osobnost / archetyp** (select: aggressive, diplomatic, mercantile, isolationist, expansionist, scholarly, militarist, theocratic — s českými popisky a emoji)
  - **Krátký popis / flavor** (textarea, max 300 znaků, volitelné — pošle se AI generátoru jako narativní hint)
  - **Tlačítko ✨ "Vygeneruj AI"** (volitelně, využije existující edge function `extract-civ-identity` se zkráceným promptem, nebo Lovable AI gateway přes nový micro-edge `generate-faction-flavor` — viz sekce backend)
- Tlačítko **"🎲 Náhodně vyplnit všechny"** — vygeneruje pestrý mix archetypů a fantasy jmen lokálně bez AI volání (rychlé).
- Collapsible per-frakce řádky (default rozbalený první, ostatní složené), aby to neutopilo UI při 8 protivnících.

State držený ve `WorldSetupWizard` jako:
```ts
const [aiFactions, setAiFactions] = useState<FactionSeedInput[]>([]);
```

`useEffect` na změnu `resolved.factionCount` doplní/ořízne pole tak, aby si zachovalo už vyplněné záznamy.

### 2. Předat custom AI frakce do bootstrap

V `handleSubmit` nahradit auto-generovaný `factionsArr` skutečným `aiFactions`. Pokud hráč některé políčko nechá prázdné, doplnit ho fallbackem (jméno / personalita) lokálně.

`FactionSeedInput` v `src/types/worldBootstrap.ts` už má `name`, `personality`, `description` — žádný typový rozšíření netřeba.

### 3. Backend — využití custom dat

`supabase/functions/_shared/seed-realm-skeleton.ts` (a `world-generate-init`) už `factions` přijímají. Ověřit, že:
- Jméno se zapisuje do `countries.name` AI hráčů.
- Personalita se zapisuje do `game_players.personality` (resp. odpovídajícího sloupce — dohledat v `seed-realm-skeleton`).
- `description` se předá AI generátoru kronik a faction-turn promptu jako narativní context (vetká do prehistorie a Chronicle Zero podobně jako hráčova `foundingLegend`).

Pokud `description` zatím nikam neteče, přidat jeden řádek do `world-generate-init` promptu typu *"Kontext AI frakcí: {name} — {personality} — {description}"*.

### 4. Volitelný edge: `generate-faction-flavor`

Mini edge-function pro tlačítko ✨ na řádku frakce: dostane `{ premise, archetype, name? }`, vrátí `{ name, description }` přes Lovable AI gateway (`google/gemini-3-flash-preview`, tool calling pro strukturovaný výstup). Cca 40 řádků kódu, využívá vzor z `extract-civ-identity`.

### 5. Oprava React ref warningu

V `SpawnPreferencePicker.tsx` a `GovernmentFaithStep.tsx` (a pro jistotu i `RulerStep`, `SecretObjectiveStep`, `HeraldryPicker`) obalit export do `React.forwardRef` nebo, jednodušeji, **v `CivSetupStep` přidat `<div>` wrapper kolem každého child uvnitř `CollapsibleContent`**, takže Radix bude předávat ref na ten div, ne na funkční komponentu. Levnější varianta — žádný refactor child komponent.

### 6. Validace

`canSubmit` zůstává jak je. Nepřidávat AI frakce do `civValid` — jsou opt-in (pokud hráč nic nevyplní, použije se rozumný default).

## Soubory k úpravě

- **Nový**: `src/components/world-setup/AIOpponentsStep.tsx`
- **Nový (volitelný)**: `supabase/functions/generate-faction-flavor/index.ts`
- **Edit**: `src/components/WorldSetupWizard.tsx` — `aiFactions` state, useEffect na `factionCount`, render `<AIOpponentsStep />` pod `<CivSetupStep />` (skrýt v MP módu, tam má každý hráč vlastní setup), předání do `handleSubmit`. Plus `<div>` wrapper fix kolem children v `CivSetupStep`.
- **Edit**: `src/components/world-setup/CivSetupStep.tsx` — `<div>` wrapper kolem `<SpawnPreferencePicker>`, `<GovernmentFaithStep>`, `<RulerStep>`, `<SecretObjectiveStep>`, `<HeraldryPicker>` uvnitř `CollapsibleContent` (oprava ref warningu).
- **Edit (backend)**: `supabase/functions/_shared/seed-realm-skeleton.ts` a `supabase/functions/world-generate-init/index.ts` — ověřit/doplnit zápis `description` AI frakcí do generátoru kronik.

## Co tím dostaneš

- V wizardu pod „Tvá civilizace" se objeví karta **„🤖 AI Protivníci"** s editovatelným seznamem podle slideru počtu frakcí.
- Hráč může pojmenovat každého protivníka, zvolit archetyp, napsat krátký flavor — nebo si to nechat náhodně/AI-vygenerovat.
- Custom data tečou do generátoru světa a AI frakce mají od začátku unikátní identitu (ne `AI Frakce 1`).
- Zmizí React warning *"Function components cannot be given refs"* v konzoli.

Po schválení implementuji.