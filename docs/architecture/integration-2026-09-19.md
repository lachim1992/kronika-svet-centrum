# Integration record — 2026-09-19

Current upstream checked again: `8ac47c944779446259bab84c949a162fdafc5314`.
Local implementation is based on that exact tree, not the old Codex branch.

## Scope and acceptance still in progress

- Canonical physical economy, workforce, production inputs, trade conservation,
  storage, fiscal single writer, Famous Goods and hub hierarchy.
- Management UI specification supplied September 19: shared status/trend/cause/
  constraint/action-preview/provenance across Home, Economy, City, map, Army,
  Council and associated management screens.
- Review all earlier local work, reconcile with current upstream, validate, and
  deploy both backend/migration and frontend. Deployment is explicitly authorized.

## Earlier work reviewed

Sources include the previous `kronika-publish` working tree and its publication
patch, plus the task reports for army manpower, biome previews, building images,
and UI cleanup. Old backend files and lockfiles are not copied wholesale.

| Earlier finding | Integration approach |
| --- | --- |
| Recompute must not resolve a turn | Compatibility endpoint delegates only to refresh; process-turn rejects recalcOnly. |
| Export surplus / buyer demand counted repeatedly | One physical balance ledger debits every transfer and consumption. |
| Current and historical snapshots mixed | Turn-scoped replacement and paginated current-turn panel reader. |
| Hidden DB failure followed by fiscal mutation | Strict success payload checks and failure propagation; audit ongoing. |
| Second refresh after commit, double clicks | Reused audited hook and synchronous ref guard; server concurrency still to verify. |
| Hex distance on square worlds | Shared topology helper in route generation; single-major orphan attachment repaired. |
| Flow path failure marked successful | Path deletion/upsert must succeed before route aggregate updates. |
| Manpower derived from corrupt reserve | Shared actual-soldier/workforce helper; UI call-site audit ongoing. |
| Macro sub-biomes and building images | Current renderer comparison pending; preserve newer square map architecture. |
| CI and regression harness | Reintroduce applicable tests and current dependency-compatible CI; pending. |

## Verification boundary

At the last completed checkpoint: 109 local tests passed, 2 live tests skipped;
frontend build and TypeScript passed. Later edits require a fresh check.
The SQL migration/projection was exercised in PGlite against a generated schema
fixture. This is not proof of deployment or production database compatibility.

Test target supplied by the user: `test01`, with game URL
`https://kronika-svet-centrum.lovable.app/game/eba99766-9046-4daf-a367-9f31380cbba1`.
The public app opens; the available browser is currently at app authentication.
Lovable preview separately requires Lovable authentication. No credentials have
been requested in chat, no production turn has been advanced, and no deployment
of the full economic migration has yet been performed in this integration pass.

## Incremental releases to main, September 19

User requested shipping independently ready changes immediately and will inspect
them in Lovable; browser login is unavailable. The following commits were pushed
through the GitHub API with non-forced fast-forward updates:

- `6962a289bc900504a4e2a1ef96ca2d1560d3bc3d`: synchronous double-click guard,
  per-phase turn error reporting, removal of duplicate post-commit refresh.
- `e6bcadea458b3560c9e67c27fb6ed7900aada5ed`: exact-turn, paginated market/need
  reads, stale response cancellation, regression tests.
- `3bc562c251dd20141811a46304a3184cddb0467f`: legacy recompute delegates only
  to refresh, rejects incomplete/failed results, actual handler regression tests.

These changes were independently assembled over the original upstream tree in
`../chronicle-release`: 108 tests passed, 2 live tests skipped, TypeScript passed.
The frontend production build passed after the frontend changes; the final commit
only adds the edge adapter and its tests. No new migration is required by these
three releases. The recompute edge function must still be deployed by the hosting
provider; a Git commit alone is not evidence of its runtime deployment.

Full integration work remains local, including the new goods schema/solver and
management views. Latest full working-tree checks: 123 tests passed, 2 live tests
skipped, TypeScript passed; all edge function files parse without syntax errors.
Later privacy changes moved the physical panel to owner-scoped management RPC
and removed authenticated access to raw solver snapshots. Public publishing and
live game behavior have NOT been verified. Lovable requires republishing to update
the public URL: https://docs.lovable.dev/features/publish

## Integrated goods and management release

The working release now includes the shared solver, guarded fiscal projection,
owner-scoped reports, exact-turn reads, shared scenario previews, square-coordinate
route generation and army workforce corrections. Home, Economy, City, Army and
Council have report-backed views. The macro map again shows terrain subdivisions
when zoomed out; existing building-template images are reused when available.

Local validation: **132 tests passed, 2 live tests skipped**. Frontend type checking,
changed edge-function type checking and production build passed. The edge check
uses ambient declarations for Deno and remote Supabase imports; it does not prove
that the deployed provider accepts or runs the bundle. PostgreSQL fixture checks
also pass for migrations, projection idempotence, fiscal accrual, immutable committed
stocks, duplicate/failed turn guards and restricted raw-snapshot access.

The full 64-section Management UI specification is broader than this release.
Remaining work includes dedicated Diplomacy/War Room/Chronicles/Wiki views,
previews for every individual building and policy command, demand-weighted history
visualizations and hosted screenshots. Recruitment/remobilization validation reads
live population, but multi-command military writes have not yet been converted into
one database transaction. War declarations block direct enemy trade; territorial
transit permissions require a separate route-access model.

This is an integration milestone, **not a claim that the entire task or live rollout
is complete**. Backend migrations and deployed functions require access to the
hosting project, currently unavailable to this session. The deploy manifest and
`.lovable/plan.md` describe the exact coordinated rollout. Publish alone is not
proof that these migrations and functions have been deployed.
