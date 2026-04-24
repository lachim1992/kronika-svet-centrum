---
status: Normative
authority_level: 1
applies_to: Track 2 PR merge gate (T2-PR0 through T2-PR5)
enforcement: Manual approval commit + CI checks
---

# World Layer Activation Gate

> **Purpose:** Defines the six conditions (G1–G6) that MUST be simultaneously
> satisfied before any Track 2 PR (including T2-PR0) may be merged to `main`.
>
> **Authority:** Normative. The gate is not a one-time check — it is a
> continuous invariant. If any condition stops holding after a Track 2 merge,
> further Track 2 PRs are blocked until remediation.

---

## Gate Conditions

### G1 — `BETA_SCOPE.md` extension merged

`docs/BETA_SCOPE.md` MUST contain a section titled
"World-layer simulation (post-beta-foundation)" with explicit listing of
the new in-scope items (DB migrations, new tables, new commands, new
`commit-turn` phases).

This extension MUST be merged as a **separate PR** before T2-PR0, signed off
by the beta scope owner.

**Verification:** Git log + manual review.
**Owner:** Beta scope owner.

---

### G2 — Track 1 stability window

T1-PR1, T1-PR2, and T1-PR3 MUST all be in `main` for **at least 7
consecutive calendar days** with no rollback or revert.

**Verification:**

```bash
git log --since="7 days ago" main -- '.lovable/plan.md' \
  docs/architecture/world-layer-contract.md \
  | grep -i 'revert\|rollback'
# expected: empty
```

**Owner:** CI.

---

### G3 — Beta Smoke green streak

`BetaSmokeHarness` 30-turn smoke MUST be **green for 7 consecutive days**
on `main` (daily run, no red runs in that window).

**Verification path (per Δ-B):**

- **Preferred:** existing `dev_smoke_runs` table in repo, queried for the
  last 7 daily runs.
- **Fallback:** if `dev_smoke_runs` does not exist in repo at the time of
  Track 2 PR review, G3 is verified **manually** by the reviewer checking
  7 consecutive green CI runs in GitHub Actions / Lovable CI history.

**Track 1 does NOT introduce a new smoke log table** (L1 whitelist preservation).
Any future smoke logging infrastructure is post-Track-1 work, gated separately.

**Owner:** CI / reviewer.

---

### G4 — No open P0/P1 in canonical loop

There MUST be **zero open issues** labeled `priority:P0` or `priority:P1`
that affect canonical loop scope:

- `useGameSession`
- `command-dispatch`
- `commit-turn`
- `refresh-economy`
- `realm_resources`

**Verification:** Issue tracker query.
**Owner:** Triage owner.

---

### G5 — Track 2 has its own smoke profile

Before T2-PR1 (and every subsequent Track 2 PR), the repo MUST contain
a `BetaSmokeHarness` profile `"world-layer"` that:

1. Runs the canonical 30-turn loop with `ancient_layer` **absent**.
2. Asserts that `commit-turn` Phase 4–9 are strict no-ops (K4).
3. Asserts no rows are written to any new world-layer table when
   `ancient_layer` is absent.

This profile is created in T2-PR1 itself (it tests T2-PR1 stubs). For T2-PR0
(scope amendment + CHECK constraint), the profile is not yet required.

**Owner:** Track 2 PR author.

---

### G6 — `world-layer-contract.md` is Normative

`docs/architecture/world-layer-contract.md` MUST have frontmatter
`status: Normative` and MUST be referenced in
`.lovable/plan.md` authority precedence list.

**Verification:**

```bash
grep -E '^status: Normative' docs/architecture/world-layer-contract.md
grep -F 'world-layer-contract.md' .lovable/plan.md
# both expected: non-empty
```

**Owner:** Architecture owner.

---

## Approval Mechanism

Opening Track 2 mainline merges requires a **signed approval commit** below.

The commit message MUST follow the format:

```
[track-2-activation-approved]

G1: <link to BETA_SCOPE.md PR>
G2: <git log evidence>
G3: <smoke run evidence (table query OR CI link)>
G4: <issue tracker query result>
G5: <link to world-layer smoke profile> (N/A for T2-PR0)
G6: <commit hash where world-layer-contract.md became Normative>

Approved by: <architecture owner name>
Date: <ISO date>
```

Without this commit appended below, CI MUST reject Track 2 PRs.

---

## Approval Log

> *(Empty — to be filled when the gate opens.)*

---

## Continuous Invariant

If after Track 2 has been activated, any condition G1–G6 stops holding
(e.g. a P0 regression appears in canonical loop), further Track 2 PRs
are blocked until remediation. This is enforced by reviewer discipline
and by re-running the verification checks above before each Track 2 PR.
