## Audit: Promítají se diplomatické zprávy mezi AI frakcemi do vztahů?

**Krátká odpověď:** Částečně ano, ale s několika tichými bugy. Pakty mezi AI ↔ AI se ve skutečnosti **nikdy nevytvoří** a vztah se přepočítá jen z `diplomatic_memory`, takže celý dopad je výrazně tlumený a nepřesný.

### Jak to teď reálně funguje

Pipeline (vše běží v `commit-turn`, ne v reálném čase):

```text
diplomacy_messages  ──┐
diplomatic_pacts    ──┼──► diplomatic_memory ──► diplomatic_relations ──► ai_factions.disposition
world_action_log    ──┤        (s decay)         (trust/fear/grievance/…)
wars                ──┘
```

1. `ai-faction-turn` insertne zprávy `[OBCHODNÍ DOHODA]`, `[OBRANNÝ PAKT]`, případně `[PŘIJATO]` do `diplomacy_messages`.
2. `commit-turn` (sekce „4. Diplomacy messages with action tags") prochází zprávy a vytváří záznamy v `diplomatic_memory` typu `cooperation` / `threat`.
3. Z `diplomatic_memory` se v `commit-turn` přepočte `diplomatic_relations` (trust ±, grievance ±, cooperation_score ±, …).
4. Z `diplomatic_relations` se sync skóre zpátky do `ai_factions.disposition`.

### Nalezené problémy (bug audit)

**1. Pakty AI ↔ AI se reálně netvoří.** `ai-faction-turn` při auto-acceptu (`disposition > 20`) jen vloží `[PŘIJATO]` zprávu — nikde se nevolá `diplomacy-reply`, který je jediný insert point pro `diplomatic_pacts`. Důsledek: bonus +15 trust / +10 cooperation za alianci se neaplikuje, jen mírný memory bonus.

**2. 5-minutové wallclock okno.** V `commit-turn` (~ř. 2123): `if (now - createdAt > 5 * 60 * 1000) continue`. Zprávy starší než 5 minut reálného času se vůbec nezpracují. Při delší pauze mezi tahy se ztratí celý batch.

**3. Hardcoded tagy.** Detekuje se jen `[ULTIMÁTUM]`, `[OBCHODNÍ DOHODA]`, `[OBRANNÝ PAKT]`, `[PŘIJATO]`. Zprávy z replay obrázku jako čistá lore-vyjádření soustrasti / kondolence / odsouzení **nemají žádný dopad**, i když by logicky měly tlačit cooperation nahoru.

**4. Globální limit 50 zpráv** přes všechny rooms — při 6+ AI frakcích se starší zprávy v rámci jednoho tahu zahazují.

**5. Návrh = stejný efekt jako přijetí.** `[OBCHODNÍ DOHODA]` (pouhý návrh) generuje stejný `cooperation` memory jako `[PŘIJATO]`. AI tedy může spamovat návrhy a uměle si zlepšovat vztahy.

**6. Žádný negativní efekt za odmítnutí / ignorování.** Pokud druhá strana nereaguje nebo pošle `[ODMÍTNUTO]` (tag, který se nikde neparsuje), nestane se nic.

---

## Plán oprav

### A. Skutečně tvořit pakty AI ↔ AI
V `ai-faction-turn` (auto-accept blok ~ř. 2280–2298):
- Po insertu `[PŘIJATO]` invokovat `diplomacy-reply` se `decision="accept"` nebo přímo zavolat sdílenou util funkci, která vloží řádek do `diplomatic_pacts`.
- Mapování typu zprávy → `pact_type`: `[OBCHODNÍ DOHODA]` → `trade_pact`, `[OBRANNÝ PAKT]` → `defense_pact`, případně `alliance` při dvojitém disposition > 50.
- Přidat `expires_turn = currentTurn + 10` (parametrizovatelně).
- Idempotence: před insertem zkontrolovat existující active pact stejného typu.

### B. Spravit memory projekci v `commit-turn` (~ř. 2108–2150)
- **Odstranit 5-min wallclock filtr.** Nahradit per-room kurzorem: tabulka `diplomacy_messages` dostane sloupec `processed_for_memory_turn INT`, vybírat jen nezpracované zprávy a po commitu označit.
- **Per-room limit** (např. 20 zpráv / room / turn) místo globálního 50.
- **Rozšířit tag set** + jemnější váhy:
  - `[PŘIJATO]` → cooperation +3, trust +2 (importance 3)
  - `[ODMÍTNUTO]` → grievance +2, trust −1
  - `[NÁVRH …]` → bez okamžitého memory (jen log)
  - `[KONDOLENCE]`, `[PODPORA]` → cooperation +1
  - `[ODSOUZENÍ]`, `[VAROVÁNÍ]` → grievance +2, fear +1
- Tag parser vytáhnout do helperu `parseDiplomacyTag(text)` — sdílený s AI prompty, aby se LLM učila konzistentní slovník.

### C. Aktualizovat AI prompt v `ai-faction-turn`
- Přidat do system promptu seznam povolených tagů + jejich významy.
- Vynutit, že každá vygenerovaná diplomatická zpráva začíná jedním tagem.
- Důsledek: deterministická projekce do vztahů.

### D. UI — Audit Trail tab v `DiplomacyDebugPanel`
- Přidat sloupec „Memory impact" k existujícím zprávám (jaký memory záznam vznikl, +X trust / −Y grievance).
- Indikátor zprávy bez tagu = „lore only, žádný dopad".

### E. Out of scope (zatím)
- Realtime přepočet vztahů mimo `commit-turn`.
- Sentiment analýza čisté lore (bez tagu) přes LLM.
- Multilateral pakty (3+ stran).

### Dotčené soubory
- `supabase/functions/commit-turn/index.ts` (sekce diplomacy_messages → memory, ~ř. 2108–2150)
- `supabase/functions/ai-faction-turn/index.ts` (auto-accept blok ~ř. 2270–2300, system prompt)
- `supabase/functions/diplomacy-reply/index.ts` (export sdílené util pro pact creation, případně refaktor)
- nová migrace: `diplomacy_messages.processed_for_memory_turn`, případně `diplomacy_messages.action_tag`
- `src/components/dev/DiplomacyDebugPanel.tsx` (Audit Trail s memory impactem)
