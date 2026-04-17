

User schválil plán s 3 implementačními poznámkami. Integruji je do finální verze. Žádné nové kolo review — plán je ready.

# Inventory Repair Commit (NE konsolidace) — final

## Disciplinární podmínky

1. **Inventory repair, ne consolidation.** Po commitu nelze tvrdit "cleanup pokročil".
2. **Cascade deleters = plnohodnotná kategorie.**
3. **Pořadí dalšího zásahu otevřené** — re-rozhodne se po tomto commitu.
4. **Striktní role separation** mezi 3 dokumenty.

## 1. `docs/architecture/legacy-writer-audit.md` (nový)

Operativní baseline, NE append-only log. Struktura:

```
## Method
grep `from\(["']player_resources["']\)` napříč supabase/functions/** a src/**

## Last verified
<datum commitu>

## Writer inventory          ← BEZ čísla v nadpisu
### Runtime writers
- supabase/functions/process-turn/index.ts (update/insert per turn, ověřeno ~lines 1445-1475)
- supabase/functions/command-dispatch/index.ts (wealth.stockpile sync)

### Seed writers
- src/hooks/useGameSession.ts (initPlayerResources)
- src/components/WorldSetupWizard.tsx
- src/pages/MyGames.tsx
- src/components/dev/SeedSection.tsx
- supabase/functions/world-generate-init/index.ts
- supabase/functions/mp-world-generate/index.ts
- supabase/functions/repair-world/index.ts
- supabase/functions/generate-promo-world/index.ts

### Editor writers
- src/hooks/useGameSession.ts (updateResource)
- src/components/dev/DevPlayerEditor.tsx (saveResource)
- src/components/dev/EconomyQASection.tsx

### Cascade deleters
- src/components/AdminMonitorPanel.tsx (remove player flow)

## Reader inventory          ← stejná taxonomie jako DEPRECATION.md
### Read-only UI consumers
- LeaderboardsPanel, AdminMonitorPanel, EmpireOverview

### Write-path UI consumers
- EmpireManagement

### Prop-threading only
- GameHubFAB, CouncilTab, CivTab, WorldTab, CodexTab

## Corrected false assumptions   ← KRÁTKÉ, bez eseje
- "process-turn už nezapisuje do player_resources" — FALSE. Writer ověřen ~lines 1445-1475.
- "DEPRECATION.md uvádí všechny writery" — FALSE. Chyběly: command-dispatch, 4 edge seedery, AdminMonitorPanel delete.

## Next verification command
grep -rn "from\(['\"]player_resources['\"]\)" supabase/functions src/
```

## 2. `DEPRECATION.md` — exekuční plán (rozšířit)

- Doplnit chybějící writery do existujících kategorií.
- **Přidat 6. kategorii: Cascade deleters** (rovnocenně).
- Lead-in řádek: *"Faktická evidence v `docs/architecture/legacy-writer-audit.md`. Tento dokument je exekuční plán."*
- **Order of dismantling: označit jako tentativní** — *"Pořadí je otevřené k re-rozhodnutí po inventory repair. Read-only-first není automaticky správné, pokud nově objevené writery představují nižší-riziko první zásah."*

## 3. `docs/architecture/ontology.md` — minimální dotek

V sekci "Not canonical" pouze jeden odstavec:
> Legacy surface zahrnuje legacy tables (`player_resources`, `military_capacity`, `trade_log`) a všechny seed / runtime write / editor / cascade-delete flow, které se jich dotýkají. Faktický inventář viz `docs/architecture/legacy-writer-audit.md`.

Žádný grep dump.

## Soubory v commitu

| Soubor | Akce |
|---|---|
| `docs/architecture/legacy-writer-audit.md` | **Nový** — operativní baseline |
| `DEPRECATION.md` | Rozšířit + Cascade deleters + tentativní order + lead-in |
| `docs/architecture/ontology.md` | 1 odstavec + odkaz |

## Mimo scope

- ❌ Změna jakéhokoli writeru
- ❌ Migrace konzumentů
- ❌ Rozhodnutí o pořadí dalšího zásahu
- ❌ Tvrzení "consolidation pokračuje"

## Co následuje (NE součást)

1. `useGameSession` seed/editor/read audit
2. Re-rozhodnutí prvního reálného zásahu

