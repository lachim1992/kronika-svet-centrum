# Sphaera and Olympic fixes — 2026-09-19

Apply `20260919220000_atomic_sports_nomination.sql` before deploying these functions:

- games-qualify
- games-bid
- games-announce
- games-select-host
- games-resolve
- games-resolve-discipline
- league-play-round
- league-play-batch

Deploy their shared `sports.ts` and `sportsAuth.ts` dependencies, then publish the
frontend. Target the existing Chronicle project `kvzzfthrefdisuohzfws` and public
site `https://kronika-svet-centrum.lovable.app`. Preserve saved games.

## Fixed

- Exhausted Sphaera schedules stop recursing. Missing home and away legs are
  independently repaired and a club cannot be scheduled twice in a repair round.
- Season completion receives the just-played round number rather than stale state.
- Batch failures report completed rounds and stop; the UI retains partial results.
- Sports endpoints authenticate the session/player; league execution and host
  selection require an administrator or moderator, discipline resolution its host
  or an administrator. Trusted internal service calls remain supported.
- Festival lookup is constrained to the authorized session.
- Invalid/duplicate nomination IDs are rejected before any changes. The replacement
  RPC locks and revalidates the festival and athletes, then replaces the team in one
  transaction. Failed inserts roll back; selection flags are reset consistently.
- Discipline execution claims a unique reveal before simulation. Concurrent claims
  are rejected; completed requests replay saved results. Ordinary failures reset
  the claim; a process crash can still require operator repair of `resolving` state.
- The player applies the HTTP result without requiring a Realtime delivery and
  displays resolution errors. Closing games checks the write error and requires
  all disciplines; an empty list is not considered completed.
- Empty festival lists clear previous detail data; rejected starts no longer open
  an overlay pretending the games started.

## Verification boundary

Local TypeScript checks cover frontend and these eight server handlers. Regression
tests cover schedules, invalid nominations, partial batches, authentication,
completed discipline retries and missing athletes. A local PGlite fixture verifies
nomination rollback, phase checks and RPC permissions, not the complete live schema.

This is a targeted repair, not proof that every sports subsystem is bug-free.
Whole league rounds and legacy full-festival resolution still use multiple writes;
their crash recovery and concurrent execution need a transactional redesign. Live
hosted checks, nomination permissions, rewards/history and season promotion should
be verified on test01 after deployment. No live deployment is claimed by this file.
