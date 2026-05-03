
# Dávka 1 — AI cost & storage hardening (revidováno)

Schváleno P0 + P1 + P2 s korekcemi. P3 odložena na samostatnou dávku.

## Hlavní princip
- Otevření detailu **nikdy** nevolá AI funkci.
- `wiki-generate` je cache-first; AI volání jen pokud `force=true`.
- Cover image = canonical replace. Ostatní `kind` (illustration/draft) zůstávají append-only kvůli WonderPortrait workflow.

---

## P0 — Vypnutí lazy autogenerace při otevření detailu

**`src/components/CityDetailPanel.tsx` (řádky 206–234)**
- Odstranit celý `lazy generate` blok, který volá `wiki-generate`.
- Otevření detailu načte jen DB. Pokud chybí text, zobrazit placeholder + tlačítko "Generovat wiki" (existující flow přes `WikiPanel.tsx` → orchestrator).

**`src/components/chrowiki/ChroWikiDetailPanel.tsx` (řádky ~230–290)**
- Stejný zásah: odstranit auto invoke `wiki-generate`. `generating_lock` logiku zachovat jen pro explicitní akci.
- Druhé místo na řádku 559 je explicitní button → ponechat (přesměrování na orchestrator je P3).

**Server config default**
- V `world-generate-init` / `mp-world-generate` / wherever `economic_params` se inicializuje, nastavit `lazy_generate_on_open: false` jako default.
- Backfill SQL (data update, ne migrace):
  ```sql
  UPDATE server_config
  SET economic_params = jsonb_set(
    COALESCE(economic_params, '{}'::jsonb),
    '{lazy_generate_on_open}', 'false'::jsonb, true)
  WHERE COALESCE(economic_params->>'lazy_generate_on_open','') = '';
  ```

---

## P1 — `wiki-generate` cache-first guard

**`supabase/functions/wiki-generate/index.ts`**
- Hned po načtení `existingWiki`, před `invokeAI`:
  ```ts
  const force = body.force === true;
  const hasContent = existingWiki?.ai_description?.trim().length > 10
                  || existingWiki?.summary?.trim().length > 0
                  || existingWiki?.body_md?.trim().length > 0;
  if (!force && existingWiki && hasContent) {
    return jsonResponse({
      ok: true, cached: true, skipped: true,
      entry_id: existingWiki.id,
      summary: existingWiki.summary,
      aiDescription: existingWiki.ai_description,
      imageUrl: existingWiki.image_url,
      imagePrompt: existingWiki.image_prompt,
    });
  }
  ```
- Žádné `invokeAI`, žádné delegování na `generate-entity-media` v cached větvi.

**`supabase/functions/wiki-orchestrator/index.ts`**
- V `_generateText` přidat `force: true` do body pro `wiki-generate` (volá se jen v `actionRegenerate` nebo v ensure když text chybí — v obou případech chceme přepsat).

---

## P2 — Cover replace mode (ostatní kindy beze změny)

### DB migrace
```sql
ALTER TABLE encyclopedia_images
  ADD COLUMN IF NOT EXISTS storage_path text NULL,
  ADD COLUMN IF NOT EXISTS image_version int NOT NULL DEFAULT 1;

-- Preflight cleanup: ponechat nejnovější cover per entitu, ostatní označit jako 'illustration'
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY session_id, entity_type, entity_id
      ORDER BY is_primary DESC, created_at DESC
    ) AS rn
  FROM encyclopedia_images
  WHERE kind = 'cover' AND entity_id IS NOT NULL
)
UPDATE encyclopedia_images SET kind = 'illustration', is_primary = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Pouze jeden canonical cover per entita
CREATE UNIQUE INDEX IF NOT EXISTS encyclopedia_images_one_cover
ON encyclopedia_images(session_id, entity_type, entity_id)
WHERE kind = 'cover' AND entity_id IS NOT NULL;

-- Pouze jeden wiki entry per (session, type, entity_id)
CREATE UNIQUE INDEX IF NOT EXISTS wiki_entries_entity_unique
ON wiki_entries(session_id, entity_type, entity_id)
WHERE entity_id IS NOT NULL;
```

### `supabase/functions/generate-entity-media/index.ts`
- Přijímat `force?: boolean` v body.
- Hned na začátku, pokud `kind === 'cover'` a `force !== true`:
  ```ts
  const { data: existingCover } = await sb.from("encyclopedia_images")
    .select("id, image_url, image_prompt, storage_path, image_version")
    .eq("session_id", sessionId).eq("entity_type", entityType)
    .eq("entity_id", entityId).eq("kind", "cover").maybeSingle();
  if (existingCover?.image_url) {
    return jsonResponse({ imageUrl: existingCover.image_url, cached: true, ... });
  }
  ```
- Generování obrázku — beze změny.
- Upload pro `kind === 'cover'`:
  ```ts
  const storagePath = `${sessionId}/${entityType}/${entityId}/cover.png`;
  await sb.storage.from("wonder-images").upload(storagePath, binaryData, {
    contentType: "image/png", upsert: true,
  });
  ```
- DB pro `kind === 'cover'`: `upsert` na unique key (nebo update pokud existuje, insert pokud ne) — neaplikovat insert+is_primary=false trick, protože unique index by kolidoval. Inkrementovat `image_version`.
- Pro `kind !== 'cover'`: ponechat současný append flow (timestamped path, insert nového řádku). WonderPortrait drafty fungují dál.

### Orchestrator
- `actionRegenerate` s `fields=['image']` musí posílat `force: true` do `generate-entity-media`. Jinak by ensure-cache-hit zablokoval explicit regenerate.
- `actionEnsure` posílá `force: false` (default) → cache-hit OK.

---

## Acceptance

- Otevření CityDetailPanel ani ChroWikiDetailPanel nevolá žádnou edge funkci pro generování.
- `wiki-generate` s existujícím contentem vrátí `cached: true`, žádný AI call.
- `wiki-generate` s `force: true` regeneruje normálně.
- `generate-entity-media` `kind='cover'` bez force → vrátí existující URL bez AI call.
- Regenerate cover přepíše soubor `<sid>/<type>/<id>/cover.png` a UPDATE existující řádek (žádný nový INSERT).
- `kind='illustration'` (WonderPortrait drafty) nadále podporuje vícero řádků.
- `batch-regenerate-wiki` funguje bez kolize s unique indexem (volá orchestrator regenerate → force=true → upsert).

---

## Co NENÍ v této dávce (P3, samostatně)

- Refactor `CityDirectory`, `CityManagement`, `WonderPortrait`, `SmartAIGenerationPanel`, `UnifiedEntityDetail`, `AdminWikiTools`, `CityBuildingsPanel`, `MemoriamCard` na orchestrator.
- Deprecation adaptéry pro `encyclopedia-generate` / `encyclopedia-image`.
- WonderPortrait promote-draft-to-cover flow (vyžaduje vlastní design — nyní by se s novým unique indexem musel řešit jako "promote = update existing cover row").

Pozn.: Po nasazení P2 unique indexu **WonderPortrait promote** (illustration → cover) musí přepsat existující cover row, ne insert. Jinak hodí constraint violation. Označit jako follow-up úkol pro P3 — v Dávce 1 se promote flow nemění, jen drafty (kind='illustration') zůstávají append.
