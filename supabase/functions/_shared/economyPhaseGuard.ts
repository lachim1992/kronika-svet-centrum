export function economyFailure(data: any, error: any): string | null {
  if (error) return String(error.message || error);
  if (!data || data.ok !== true || data.error) return String(data?.error || 'Economy phase returned no success');
  return null;
}
export async function guardedFiscal<T>(failures: readonly unknown[], run: () => Promise<T>): Promise<T> {
  if (failures.length) throw Error('Mandatory derived economy phase failed');
  return run();
}
