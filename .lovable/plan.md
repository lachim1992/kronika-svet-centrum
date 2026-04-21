

# System Audit — Decision Pack (v3 final)

## Changes vs. v2
1. **Evidence header** added to every document (scope, date, sources, confidence, blind spots)
2. **Stop conditions + escalation paths** added to each remediation phase
3. **decision-conflicts.md** elevated to authoritative resolution layer, not appendix
4. **cross-surface-consistency-matrix.md**: added `runtime test required?` column
5. **command-surface-inventory.md**: added `Sprint 1 fixable?` column
6. **beta-closure-checklist.md**: split into Ship blockers / Honesty blockers / Deferred debt
7. Package renamed from "6+1 decision documents" to "System Audit — Decision Pack"

## Documents to generate (all `/mnt/documents/`)

### Every document gets this header:
```
## Evidence header
- Repo snapshot: main @ generation date
- Audit date: 2026-04-21
- Static sources: grep/rg across src/, supabase/functions/, file reads
- Runtime evidence: none (static analysis only)
- Confidence: per-claim FACT / INFERENCE / UNKNOWN
- Known blind spots: no runtime profiling, no network trace, no DB row inspection
```

### 1. `remediation-roadmap.md`
4-phase ordered repair sequence. Each phase includes:
- Steps with file lists and commit boundaries
- **Preconditions** (what must be verified before starting)
- **Done-when** (grep-based completion test)
- **Stop conditions** (when to halt and escalate)
- **Escalation path** (what to do if stopped)

Phase 1 (Foundation): kill ensureRealmResources, centralize ResourceHUD. Stop if: bootstrap doesn't guarantee realm row existence.
Phase 2 (Write gate): 13+ command types, rewire client bypasses. Stop if: command-dispatch event contract can't accommodate new types without schema migration.
Phase 3 (Read consolidation): all tabs read from useGameSession props. Stop if: smoke shows cross-surface metric drift after Phase 2.
Phase 4 (Smoke + cleanup): remove dead code, verify beta-closure-checklist.

### 2. `system-invariants.md`
7 invariants as PR-reviewable contract. Corrected INV-1 and INV-7 per v2. Each with: statement, current violation count, affected files, CI grep test, stop condition if invariant proves unenforceable.

### 3. `command-surface-inventory.md`
15 player actions mapped to: UI trigger, command type, target tables, current path (BYPASS/PARTIAL/OK), expected event, **Sprint 1 fixable? (yes/no)**. Actions split into immediate remediation vs later redesign.

### 4. `cross-surface-consistency-matrix.md`
12 metrics × 6 surfaces. Columns: metric, canonical source, ResourceHUD, HomeTab, EconomyTab, ArmyTab, CouncilTab, expected equality, divergence risk, **runtime test required?**

### 5. `unknowns-register.md`
8 claims requiring runtime verification. Corrected U-3 to post-remediation unknown. Each with: claim, why unknown, how to verify, owner, deadline.

### 6. `beta-closure-checklist.md`
Three sections (not two):
- **Ship blockers**: no client-side canonical writes, single fetch source, dispatchCommand gate
- **Honesty blockers**: blind mechanics not presented as working systems, cross-surface equality verified
- **Deferred debt**: legacy prop threading, table drops, governance panel rewiring

Each item classified Surface to player / Dev-only / Internal only (not "must be hidden").

### 7. `decision-conflicts.md` *(authoritative layer)*
Resolves contradictions between other 6 documents. Pre-populated conflicts:
- city_market_baskets: gap-map vs closure-checklist vs mechanics-coupling
- trade_flows: internal vs player summary
- prestige: derived vs player mechanic
- demand_baskets: solver internal vs simplified player bands
- ResourceHUD: convenience vs SoT hazard

Format per conflict: Topic, Documents in conflict, FACTS, INFERENCES, Decision, Rationale, Beta implication.

This document is referenced by all others as the final arbiter when classifications conflict.

## Implementation
7 Python scripts writing to `/mnt/documents/`. All evidence from static grep/file reads already gathered. ~150-400 lines per document. Total generation: single exec session.

