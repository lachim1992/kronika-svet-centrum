export type PageResult<T> = { rows: T[]; complete: boolean; error: string | null };
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Reads every page; any error or page cap marks the result incomplete so callers never aggregate partial data. */
export async function fetchAllPages<T>(page: (from: number, to: number) => Page<T>, pageSize = 1000, maxPages = 60): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(i * pageSize, i * pageSize + pageSize - 1);
    if (error) return { rows, complete: false, error: error.message };
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, complete: true, error: null };
  }
  return { rows, complete: false, error: "Překročen limit stránek" };
}
