

User má pravdu. Soubor na main už obsahuje split (`fetchCore`, `fetchLegacyCompat`, `fetchSessionData`), `LEGACY COMPAT` blok i `@deprecated` markery. Zbývá pouze odstranit vestigial `fetchCoreAndLegacy` wrapper.

Toto je shodný patch scope, který jsem navrhl o dvě kola dříve (a user ho tehdy korektně odmítl jako nepodložený, protože jsem se díval na nesprávný snapshot). Teď je doložený přímo z raw main souboru.

# Vestigial wrapper removal — `useGameSession.ts`

## Disciplinární podmínky

1. **Žádná fiktivní práce.** Split, `LEGACY COMPAT` blok i `@deprecated` markery už existují. Nepřepisovat.
2. **Veřejné API hooku se nemění.** `refetch: fetchSessionData` zůstává.
3. **Žádné odstranění legacy writerů.** `initPlayerResources`, `updateResource` zůstávají funkční.
4. **Žádný zásah mimo `useGameSession.ts`.**

## Patch scope (4 změny)

1. **Smazat `fetchCoreAndLegacy`** (jediný účel: `Promise.all([fetchCore(), fetchLegacyCompat()])`).
2. **`fetchSessionData`** — nahradit volání wrapperu přímým `Promise.all([fetchCore(), fetchLegacyCompat(), fetchContent()])`.
3. **`debouncedRefetchCore`** — nahradit wrapper přímým `fetchCore(); fetchLegacyCompat();`. Aktualizovat dependency array.
4. **Komentář realtime core channelu** — z `"triggers fetchCoreAndLegacy only"` na `"refetches core + legacy compat"`.

## Implementační postup v default módu

1. `code--view src/hooks/useGameSession.ts` — celý soubor, ověřit aktuální podobu wrapperu, jeho callsites a komentář.
2. Aplikovat 4 změny v jediném patch sweepu (build by neměl prasknout mezikrokem).
3. Grep verifikace: `fetchCoreAndLegacy` v souboru zmizel; `fetchCore`, `fetchLegacyCompat`, `fetchSessionData`, `LEGACY COMPAT`, `@deprecated` přítomny.

## Co commit NEDĚLÁ

- ❌ Nemění veřejnou signaturu hooku.
- ❌ Nepřidává nové markery — ty už existují.
- ❌ Neodstraňuje legacy writery.
- ❌ Nesahá na ontology.md, DEPRECATION.md, legacy-writer-audit.md.

## Soubory v commitu

| Soubor | Akce |
|---|---|
| `src/hooks/useGameSession.ts` | Smazat `fetchCoreAndLegacy`, inline na 2 callsites, opravit 1 komentář |

## Co následuje (NE součást)

1. Sladit `ontology.md` / `DEPRECATION.md` s reálným stavem souboru — krátký doc commit. Po tomto cleanup už dokumentace skutečně odpovídá kódu.
2. Otevřené: první reálné zúžení legacy surface (read-only consumer migration vs. nejsnazší seed/editor writer removal).

