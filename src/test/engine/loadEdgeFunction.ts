import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

// Execute the real handler with injected boundaries, without contacting Deno,
// Supabase or a live world. Local shared modules are evaluated unchanged.
export function loadEdgeFunction(
  name: string,
  options: { createClient?: () => unknown; fetch?: typeof fetch; env?: (name: string) => string } = {},
) {
  let handler: (request: Request) => Promise<Response>;
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const context = vm.createContext({
    Request, Response, Headers, URL, console, Date, setTimeout, clearTimeout, TextEncoder, crypto,
    fetch: options.fetch || (() => { throw new Error("Unexpected network call"); }),
    Deno: {
      serve: (fn: typeof handler) => { handler = fn; },
      env: { get: options.env || (() => "test-value") },
    },
  });
  function evaluate(filename: string): Record<string, unknown> {
    if (cache.has(filename)) return cache.get(filename)!.exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const run = vm.runInContext(`(function(require, module, exports) { ${code}\n })`, context);
    run((specifier: string) => {
      if (/^(npm:|https:).*supabase-js/.test(specifier)) {
        return { createClient: options.createClient || (() => { throw new Error("Unexpected DB client"); }) };
      }
      if (specifier.startsWith(".")) return evaluate(path.resolve(path.dirname(filename), specifier));
      throw new Error(`Unexpected import: ${specifier}`);
    }, module, module.exports);
    return module.exports;
  }
  evaluate(path.resolve("supabase/functions", name, "index.ts"));
  return (request: Request) => handler(request);
}
