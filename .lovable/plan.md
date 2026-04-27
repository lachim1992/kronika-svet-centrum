# Audit IJ8BQ5 a plán opravy

## Co je teď prokazatelně rozbité
- Relace `IJ8BQ5` je session `0de6fab4-b925-4faf-bced-14ec85730f45`, stav `ready`, kolo 4.
- V `game_players` je 5 účastníků (Lachim + 4 AI jména), ale v `ai_factions` je **0 řádků**.
- Diplomacie UI pořád existuje, ale AI reply se v praxi opírá o `ai_factions`. Proto zmizela možnost „psát si s AI“.
- V session existuje jen 1 diplomatická místnost a je typu `player_player` (`Lachim ↔ Liga Karavanních měst`), takže bez `ai_factions` se nechová jako AI komnata.
- Chybí bootstrap narativní vrstvy:
  - `chronicle_zero = 0`
  - `great_persons = 0`
  - `wonders = 0`
  - `world_feed_items = 0`
  - `ai_factions = 0`
- Wiki/obrázky jsou jen částečně hotové: 15 wiki entries, ale jen 2 s AI popisem a 2 s obrázkem.
- `trade_routes = 0`, `diplomatic_pacts = 0`, `trade_offers = 0`, `civ_tensions = 0`.
- Naopak `civ_identity` pro všech 5 frakcí existuje, takže wizard jména/flavor/identity opravdu předal a AI extrakce proběhla.

## Pravděpodobná root cause
Primární problém je v bootstrap pipeline:
- `create-world-bootstrap` vytvoří fyzický svět a session označí jako `ready`.
- AI/narativní bootstrap (`world-generate-init`) spouští jen „odpojeně“ na pozadí.
- Pro `world-generate-init` nejsou u této session žádné logy ani requesty, takže ten job zřejmě vůbec neběžel nebo byl shozen po návratu funkce.
- Současně `seed-realm-skeleton` zakládá AI hráče do `game_players`, ale **nezakládá `ai_factions`**. Tím pádem když background bootstrap neproběhne, AI je registrovaná jen napůl.

To přesně vysvětluje celý symptom cluster:
- AI frakce „existují jménem“, ale engine je nevidí jako AI.
- Diplomacy chat s AI zmizí.
- AI tahy, tenze a pacty neběží.
- ChroWiki / prolog / osoby / divy / úvod světa se nevygenerují.

## Důležitý detail k diplomacii a enginu
Mechanika `diplomacy-reply` stále obsahuje dopady do hry:
- umí zakládat `war_declarations`
- umí zakládat `diplomatic_pacts`
- umí vytvářet `trade_offers`
- umí psát `game_events`, kronikové záznamy, city rumors

Ale obchodní větev je neúplná:
- `offer_trade` dnes vytváří jen `trade_offers`, ne reálné `trade_routes`
- embargo umí blokovat existující `trade_routes`, ale nové obchodní napojení se samo nevytvoří

Takže i když AI odpoví, ekonomický dopad na síť tras není dnes dotažený do konce.

## Plán opravy

### 1. Opravit bootstrap tak, aby AI nikdy nemohla „zmizet“
- Přidat zakládání `ai_factions` už do synchronního bootstrapu, ne až do pozdější narativní fáze.
- Zachovat AI registraci v `game_players`, ale doplnit chybějící `ai_factions`, disposition, goals a personality jako kanonický minimální stav.
- Přepsat spuštění `world-generate-init` na spolehlivý background mechanismus místo „best effort detached fetch“.
- Přidat auditovatelný status narativního bootstrapu, aby šlo poznat, co doběhlo a co ne.

### 2. Přidat repair/backfill pro rozbité sessiony včetně IJ8BQ5
- Doplnit chybějící `ai_factions` z `game_players` + `civilizations`.
- Dodat idempotentní backfill pro:
  - `chronicle_zero`
  - `great_persons`
  - `wonders`
  - wiki/media generation
  - rumors/feed/world memories tam, kde chybí
- Opravit nebo zpětně přemapovat diplomatické místnosti s AI účastníkem na AI režim.
- Spustit repair konkrétně nad `IJ8BQ5` a ověřit výsledek datově.

### 3. Vrátit AI diplomacii do UI
- V `DiplomacyPanel` neodvozovat AI jen z `ai_factions`, ale i z kanonických účastníků session / civilization metadata, aby se UI nerozbilo při částečně rozbitém bootstrapu.
- Opravit vytváření a rozpoznání AI místností.
- Zajistit, aby tlačítko AI reply zůstalo dostupné pro validní AI protivníky.

### 4. Dotáhnout diplomatické dopady do enginu
- Napojit přijaté obchodní dohody na skutečné `trade_routes` nebo jejich kanonický ekvivalent.
- Po vzniku/změně obchodní dohody vyvolat správný přepočet tras a ekonomiky, aby se efekt propsal do wealth/flows.
- Zachovat pacts/war/trade jako backendovou pravdu, ne jen UI dekoraci.

### 5. Ověření po opravě
Pro `IJ8BQ5` zkontroluji, že po repairi platí:
- `ai_factions = 4`
- AI reply v diplomacii zase funguje
- existuje `chronicle_zero`
- existují `great_persons` a `wonders`
- ChroWiki má výrazně víc než 2 popsané entity
- vznikají feed položky / rumors
- obchodní dohody mohou vytvořit a ovlivnit trasy a ekonomiku

## Technické poznámky
- Root cause není ve wizard payloadu: `civ_identity` pro AI i hráče je uložená.
- Root cause je rozpad mezi synchronním bootstrapem a odpojenou narativní inicializací.
- Současná architektura je křehká, protože session jde do `ready` dřív, než je zaručeno, že doběhl kritický AI/world bootstrap.
- Oprava bude kombinace:
  - edge function changes
  - UI fallbacků
  - repair/backfill běhu nad daty

Pokud to schválíš, udělám rovnou implementaci i repair pro `IJ8BQ5`. 