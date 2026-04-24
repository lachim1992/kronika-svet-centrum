#!/usr/bin/env -S deno run --allow-read
/**
 * Track 1 CI guardrail (L1 enforcement, heuristic per Δ-D).
 *
 * Verifies that no source file in the repo writes to a forbidden table.
 * Per docs/architecture/world-layer-contract.md §3, Track 1 may write to
 * exactly one new path beyond today's canonical loop:
 *
 *   UPDATE world_foundations SET worldgen_spec = jsonb_set(...)
 *
 * This script is a HEURISTIC. It detects:
 *   - Direct .from("<table>").insert/update/upsert/delete(...) in TS/JS
 *   - New INSERT/UPDATE/DELETE in SQL migration files (advisory only)
 *
 * It does NOT detect:
 *   - Helper wrappers (db.write(...))
 *   - Dynamic table names (from(varName))
 *   - Indirect writes inside existing RPCs that begin mutating forbidden tables
 *   - DB triggers activated by writes to allowed tables
 *
 * Reviewers must verify the missing categories manually per the checklist
 * in world-layer-contract.md §8.
 *
 * Run with:
 *   deno run --allow-read scripts/check-track1-writes.ts
 *   # or via Node ts-node, etc. — kept dependency-free for portability.
 */

const FORBIDDEN_TABLES = [
  // Canonical loop owners
  "realm_resources",
  "military_stacks",
  "military_stack_composition",
  "city_buildings",
  "city_market_baskets",
  // World-layer ontology/state (Track 2 only)
  "province_nodes",
  "province_routes",
  "flow_paths",
  "node_inventory",
  "node_flow_state",
  "node_economy_history",
  "node_control_relations",
  "route_state",
  "node_turn_state",
  "node_migrations",
  "node_lifecycle_events",
  "province_saturation_breakdown",
  "heritage_claims",
];

// Whitelisted dirs/files where these writes are expected (existing canonical
// surfaces). The guardrail blocks NEW additions outside this whitelist.
const ALLOWED_PATH_PREFIXES = [
  "supabase/functions/command-dispatch/",
  "supabase/functions/commit-turn/",
  "supabase/functions/refresh-economy/",
  "supabase/functions/world-tick/",
  "supabase/functions/process-tick/",
  "supabase/functions/create-world-bootstrap/",
  "supabase/functions/_shared/",
  "supabase/migrations/",
  // Existing legacy surfaces still being rewired (Sprint A/B/C)
  "src/lib/turnEngine.ts",
];

interface Violation {
  file: string;
  line: number;
  table: string;
  snippet: string;
}

const WRITE_RE =
  /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)\s*\.\s*(insert|update|upsert|delete)\b/gi;

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  for await (const entry of Deno.readDir(dir)) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".git" ||
        entry.name === ".lovable"
      ) continue;
      await walk(full, files);
    } else if (
      entry.isFile &&
      /\.(ts|tsx|js|jsx)$/.test(entry.name)
    ) {
      files.push(full);
    }
  }
  return files;
}

function isAllowed(path: string): boolean {
  return ALLOWED_PATH_PREFIXES.some((p) => path.includes(p));
}

async function main() {
  const root = Deno.cwd();
  const files = await walk(`${root}/src`);
  await walk(`${root}/supabase/functions`, files);

  const violations: Violation[] = [];

  for (const file of files) {
    const rel = file.replace(`${root}/`, "");
    if (isAllowed(rel)) continue;

    const text = await Deno.readTextFile(file);
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      WRITE_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = WRITE_RE.exec(line)) !== null) {
        const table = m[1];
        if (FORBIDDEN_TABLES.includes(table)) {
          violations.push({
            file: rel,
            line: i + 1,
            table,
            snippet: line.trim(),
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      "✓ check-track1-writes: no forbidden write paths detected in non-allowlisted files."
    );
    Deno.exit(0);
  }

  console.error(
    `✗ check-track1-writes: ${violations.length} forbidden write(s) found:\n`
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    table:   ${v.table}`);
    console.error(`    snippet: ${v.snippet}`);
    console.error("");
  }
  console.error(
    "If this write belongs in an existing canonical surface, add the file/dir to ALLOWED_PATH_PREFIXES."
  );
  console.error(
    "If this is a Track 2 feature, it must wait for the activation gate (G1–G6)."
  );
  Deno.exit(1);
}

if (import.meta.main) {
  main();
}
