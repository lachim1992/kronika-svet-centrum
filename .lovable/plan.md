
# Plán: Realističtější bitvy + zákeřné AI války

## 1. Bitevní proslov — heuristika + minimum

**Soubor:** `supabase/functions/battle-speech/index.ts`

Aktuálně AI vrací `morale_modifier` (-10..+10). Pokud vrátí 0, hráč netuší, co zlepšit.

- Přidat **deterministickou heuristiku** k AI hodnocení (po jeho vrácení):
  - +1 pokud délka 50–300 znaků (sweet spot)
  - +1 pokud obsahuje jméno frakce nebo města
  - +1 pokud obsahuje vykřičník + emoční slovo (krev, sláva, vlast, smrt, čest, bratři…)
  - −1 pokud kratší než 20 znaků
- **Floor +1** kdykoliv AI vrátí 0 a text >5 znaků (vojáci aspoň naslouchali)
- **Cap stále ±10** po součtu
- `ai_feedback` rozšířit o krátké "důvody bonusu" (např. "(+1 délka, +1 emoce)")

**UI** (`BattleLobbyPanel.tsx` / `SpeechBlock`): feedback se už zobrazuje, ale udělat ho výraznější — žlutý box s rozpisem, ne jen šedá poznámka.

## 2. Post-battle UI: Modal + persistentní banner

Aktuálně `PendingDecisionCard` žije pohřbený v `DeployBattlePanel`. Hráč ho nenajde.

**Co přidat:**

a) **Auto-modal po vyhodnocení bitvy** — `BattleLobbyPanel` (po close `Vyhodnoceno`) zkontroluje `action_queue` na nové `post_battle_decision` daného hráče → otevře `PostBattleDecisionModal` (nový, sdílený dialog).

b) **Persistentní banner** v `WarRoomPanel` + `DeployBattlePanel` (top): žlutý baner "⚖️ Čeká rozhodnutí: Nová Lví Skála" → klik otevírá modal.

c) **Map badge** — `WorldHexMap`: nad městem s pending decision pulzující ⚖️ ikona; klik otevírá modal.

d) **Modal obsahuje 3 tlačítka** (viz bod 3): Okupovat / Drancovat / **Pronásledovat (rozprášit)** (poslední jen pokud poražený stack přežil).

**Komponenty:** nový `src/components/military/PostBattleDecisionModal.tsx`, hook `usePendingBattleDecisions(sessionId, playerName)` se sdílí napříč WarRoom/Deploy/Map.

## 3. Zničující bitvy — retreat, wipe threshold, vyšší ztráty, pronásledování

**Soubor:** `supabase/functions/resolve-battle/index.ts`

### 3a. Vyšší casualty rates (řádky 284–288)

```text
decisive_victory:  5% / 75%   (bylo 5/60)
victory:          15% / 55%   (bylo 15/40)
pyrrhic_victory:  35% / 35%   (bylo 30/30)
defeat:           50% / 20%   (bylo 40/15)
rout:             70% /  8%   (bylo 60/5)
```

### 3b. Wipe threshold (po aplikaci ztrát)

Po recompute `attackerRemaining` / `defenderStackRemaining`:
- Pokud `morale < 20` **a zároveň** `remaining < 0.2 * original` → `is_active=false, unit_count=0` (rozprášeno)
- Stejně pro reinforcement stacks
- Logovat do `game_events` jako `event_type='army_routed'`

### 3c. Force retreat o 1 hex

Pokud poražený stack (`!result.includes("victory")` z jeho pohledu) přežije:
- Spočítat 6 sousedních hexů od jeho aktuální pozice
- Filtrovat: bez nepřátelského stacku, bez nepřátelského města, průchodný terén
- Vybrat hex **nejdál od vítěze** (max axial distance)
- Pokud nějaký existuje → `UPDATE military_stacks SET hex_q=…, hex_r=…, moved_this_turn=true`
- Pokud žádný → wipe (obklíčen) + `event_type='army_encircled'`

Helper: `src/lib/hexPathfinding.ts` má sousedy; reuse.

### 3d. Tlačítko "Pronásledovat a rozprášit"

Nový command `POST_BATTLE_DECISION` s `action: "pursue"`:
- Vyžaduje že defender stack stále existuje (`is_active=true`)
- Aplikuje:
  - `attacker.morale -= 10`
  - `attacker` ztratí dalších 10% manpower (pronásledování stojí)
  - `defender` dostane dodatečné +50% z původních casualties
  - Pokud po tom `defender.units < 30% original` → wipe
- Update `realm_resources.manpower_committed` u obou stran
- Nový game_event `army_pursued`

Implementace v `command-dispatch` handleru pro `POST_BATTLE_DECISION` (najít existující a rozšířit o `case "pursue"`).

## 4. AI vyhlášení války — staging + skip ultimatum + casus belli

**Soubor:** `supabase/functions/ai-faction-turn/index.ts`

### 4a. Nový intent `prepare_invasion` (staging fáze)

V seznamu actionTypes (řádek ~784) přidat `"prepare_invasion"`.

Logika v action handleru:
- AI deklaruje cíl (target player + target hex/city)
- Vytvoří záznam v nové tabulce `ai_war_plans` (staging_turns=0..3)
- Po dobu staging tahů AI dává `move_stack` příkazy směrem k cíli (bez útoku, bez ultimata)
- **Kamufláž**: případně posílá `[OBCHODNÍ DOHODA]` nebo `[KONDOLENCE]` aby kryla úmysl
- Když dosáhne hranice (≤ 2 hexy od cílového města) NEBO `staging_turns >= 3` → automaticky vyvolá `declare_war` + `attack_target` ve stejném tahu

### 4b. Skip ultimatum při high grievance/betrayal

V `case "declare_war"` (řádek 1862): odstranit hard-fail `if (!hasUltimatum) return "ultimatum_required_first";` když:
- `grievance > 50` NEBO
- `betrayal_score > 30` NEBO
- `prepare_invasion` plán je aktivní (staging dokončen)

Místo toho označit válku v DB jako `surprise_war = true` a aplikovat **dvojnásobný stability penalty** napadené straně (z −8 na −16) — zákeřnost má dramatické následky.

### 4c. Casus belli při ohrožení

V denní AI strategii (před výběrem akcí): pokud cizí stack do **2 hexů** od mého města + ten hráč není spojenec → AI smí okamžitě `declare_war` (bez ultimata, bez staging) jako "obranná válka".

### 4d. Migrace

Nová tabulka:
```sql
CREATE TABLE ai_war_plans (
  id uuid pk,
  session_id uuid,
  faction_name text,
  target_player text,
  target_city_id uuid null,
  staging_started_turn int,
  staging_max_turns int default 3,
  status text check (status in ('staging','executed','aborted')),
  created_at timestamptz default now()
);
```

A na `war_declarations` přidat `surprise_war boolean default false`.

## Technická sekce

### Soubory ke změně
- `supabase/functions/battle-speech/index.ts` — heuristika
- `supabase/functions/resolve-battle/index.ts` — casualty rates, wipe, retreat
- `supabase/functions/command-dispatch/index.ts` — `pursue` decision
- `supabase/functions/ai-faction-turn/index.ts` — staging, skip ultimatum, casus belli
- `src/components/military/BattleLobbyPanel.tsx` — výraznější speech feedback, post-battle modal trigger
- `src/components/military/DeployBattlePanel.tsx` — banner, použít sdílený hook
- `src/components/WarRoomPanel.tsx` — banner
- `src/components/WorldHexMap.tsx` — pulzující ⚖️ badge
- **Nový** `src/components/military/PostBattleDecisionModal.tsx`
- **Nový** `src/hooks/usePendingBattleDecisions.ts`
- **Nová migrace** — `ai_war_plans` + `war_declarations.surprise_war`

### Risk/edge cases
- Force retreat může způsobit kaskádu (retreat na hex jiného nepřítele) → filter okamžitě v kandidátech.
- Staging plán může zastarat (cíl už neexistuje / je spojenec) → check před každým move + abort.
- `surprise_war` musí být viditelná v `WarRoomPanel` jako červený badge "🗡 Zákeřná válka" — informace, že hráč byl podveden.
- Heuristika proslovu nesmí přebít AI hard-failure (timeout = stále 0, jen +1 floor).

### Out of scope (případně příště)
- AI pošle false-flag obchodní dohodu těsně před útokem (lze přidat do staging cover messages, ale plnou implementaci přesunout)
- Battle visualization animations
