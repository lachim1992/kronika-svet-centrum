
# Batch A — Final (s opravami)

Scope: pouze Inkrement 1. Žádné prompt změny, žádné nové zdroje, žádný timeline.

## DB migrace (UPDATE only, žádný DELETE)

```sql
-- 1) Historické system fragmenty → event_fragment
UPDATE chronicle_entries SET source_type = 'event_fragment'
WHERE source_type = 'system';

-- 1b) NULL source_type → event_fragment (legacy řádky)
UPDATE chronicle_entries SET source_type = 'event_fragment'
WHERE source_type IS NULL;

-- 2) Dedup řádných Kronik (non-null turny):
-- ponechat nejdelší + nejnovější jako 'chronicle', ostatní → 'chronicle_duplicate'
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY session_id, turn_from, turn_to
    ORDER BY length(COALESCE(text,'')) DESC, created_at DESC
  ) AS rn
  FROM chronicle_entries
  WHERE source_type='chronicle' AND turn_from IS NOT NULL AND turn_to IS NOT NULL
)
UPDATE chronicle_entries SET source_type='chronicle_duplicate'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) Legacy chronicle s NULL turny → chronicle_legacy (mimo hlavní feed)
UPDATE chronicle_entries SET source_type='chronicle_legacy'
WHERE source_type='chronicle' AND (turn_from IS NULL OR turn_to IS NULL);

-- 4) Unique index — 1 řádná Kronika per (session, turn_from, turn_to)
CREATE UNIQUE INDEX IF NOT EXISTS chronicle_entries_one_world_round
ON chronicle_entries(session_id, turn_from, turn_to)
WHERE source_type='chronicle' AND turn_from IS NOT NULL AND turn_to IS NOT NULL;
```

`ai_faction` (81 řádků) zůstává **nemigrovaný** — bude jen skryt UI filtrem.

## Kód — soubory a změny

### `supabase/functions/command-dispatch/index.ts` (8 míst)
Ke všem `chronicle_entries.insert` přidat / přepsat na `source_type: "event_fragment"`:
- ř. 388 (CHRONICLE command), 648 (FOUND_CITY), 1006 (DECLARE_WAR), 1220 (RECRUIT_STACK), 1286 (treaty), 1363 (PROPOSE_PACT), 1406 (ACCEPT_PACT), 1495 (LIFT_EMBARGO).
- Tři už mají `source_type: "system"` — přepsat na `event_fragment`.
- Pět nemá `source_type` vůbec — doplnit `event_fragment`.

### `supabase/functions/commit-turn/index.ts` (5 míst)
ř. 407, 447, 564, 577, 596 — všechny mají `source_type: "system"` → `event_fragment`.
Hlavní zápis na ř. 872 zůstává `source_type: "chronicle"` (beze změny).

### `src/components/ChronicleFeed.tsx`
V `roundChronicles` filtru (ř. 78) přidat tvrdý whitelist:
```ts
const MAIN_CHRONICLE_TYPES = new Set([
  "chronicle", "chronicle_zero", "world_round", "world_founding",
]);
const roundChronicles = chronicles.filter(c => {
  const cf = c as any;
  if (!MAIN_CHRONICLE_TYPES.has(cf.source_type)) return false;
  if (displayRound === 0) return cf.source_type === "chronicle_zero" || cf.source_type === "world_founding";
  if (cf.turn_from != null && cf.turn_to != null) {
    return displayRound >= cf.turn_from && displayRound <= cf.turn_to;
  }
  return false; // už netolerujeme text-match fallback
});
```
`hasChronicleZero` rozšířit i na `world_founding`. `founding` (5 legacy řádků) **nepouštět** — neověřený význam.

### `src/components/SeptandaFeed.tsx`
Odstranit:
- import `BookOpen` z lucide (ř. 7) — pokud není použit jinde, odstranit.
- state `chronicling` + `setChronicling` (ř. 104).
- celé `<Button>` "Zapsat do kroniky" (ř. 328–390) včetně handleru.

## Acceptance (přesné znění)

1. Po `RECRUIT_STACK` se v Kronice světa neobjeví nová karta.
2. Po `FOUND_CITY` se v Kronice světa neobjeví nová karta.
3. Po `commit-turn` je v Kronice světa pro daný tah max 1 karta.
4. Tlačítko „Zapsat do kroniky" v Šeptandě zmizí.
5. DB pokus o druhý insert `source_type='chronicle'` se stejným `(session_id, turn_from, turn_to)` selže na unique violation.
6. Žádné texty nejsou smazány — duplicity jsou reklasifikovány na `chronicle_duplicate` / `chronicle_legacy` / `event_fragment`.

## Mimo scope
- `ai_faction` řádky se nemigrují ani nereklasifikují; v hlavní Kronice světa nebudou viditelné kvůli whitelist filtru.
- Nové zdroje pro `world-chronicle-round`, prompt s 7 sekcemi, Dějiny→Timeline, Šeptanda jako world feed, Moje kronika jako placená akce — vše Batch B–D.
- Admin rozbalovač „skryté/legacy zápisy" — později.
