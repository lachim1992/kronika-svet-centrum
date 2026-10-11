import { supabase } from "@/integrations/supabase/client";

/**
 * Admin/dev tool write path. Mirrors the small subset of the query-builder API
 * the dev panels use, but every write is executed by the admin-only
 * `admin-dev-write` function (role check, session scope, audit log).
 * Reads keep using the normal client.
 */
type Filter = { op: "eq" | "neq" | "ilike" | "in" | "is"; column: string; value: unknown };
type Result<T = any> = { data: T | null; error: { message: string } | null };

class AdminWrite implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private selectCols?: string;
  private mode: "one" | "maybe" | null = null;
  constructor(
    private sessionId: string,
    private table: string,
    private action: "insert" | "upsert" | "update" | "delete",
    private values?: unknown,
    private onConflict?: string,
    private ignoreDuplicates?: boolean,
  ) {}
  eq(column: string, value: unknown) { this.filters.push({ op: "eq", column, value }); return this; }
  neq(column: string, value: unknown) { this.filters.push({ op: "neq", column, value }); return this; }
  ilike(column: string, value: string) { this.filters.push({ op: "ilike", column, value }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ op: "in", column, value }); return this; }
  is(column: string, value: null) { this.filters.push({ op: "is", column, value }); return this; }
  select(cols = "*") { this.selectCols = cols; return this; }
  single() { this.mode = "one"; if (!this.selectCols) this.selectCols = "*"; return this; }
  maybeSingle() { this.mode = "maybe"; if (!this.selectCols) this.selectCols = "*"; return this; }

  private async run(): Promise<Result> {
    const { data, error } = await supabase.functions.invoke("admin-dev-write", {
      body: {
        sessionId: this.sessionId, table: this.table, action: this.action,
        values: this.values, filters: this.filters, select: this.selectCols, onConflict: this.onConflict, ignoreDuplicates: this.ignoreDuplicates,
      },
    });
    if (error) {
      let message = error.message;
      try { const ctx = await (error as { context?: Response }).context?.json(); if (ctx?.error) message = ctx.error; } catch { /* keep message */ }
      return { data: null, error: { message } };
    }
    if (data?.error) return { data: null, error: { message: String(data.error) } };
    let rows = data?.data ?? null;
    if (this.mode && Array.isArray(rows)) {
      if (this.mode === "one" && rows.length !== 1) return { data: null, error: { message: "Expected one row" } };
      rows = rows[0] ?? null;
    }
    return { data: rows, error: null };
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, err?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, err);
  }
}

export function devAdminDb(sessionId: string) {
  return {
    from(table: string) {
      return {
        insert: (values: unknown) => new AdminWrite(sessionId, table, "insert", values),
        upsert: (values: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => new AdminWrite(sessionId, table, "upsert", values, opts?.onConflict, opts?.ignoreDuplicates),
        update: (values: unknown) => new AdminWrite(sessionId, table, "update", values),
        delete: () => new AdminWrite(sessionId, table, "delete"),
      };
    },
  };
}
