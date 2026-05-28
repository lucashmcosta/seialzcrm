type PagedResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

export async function fetchAllPagedRows<T>(
  fetchPage: (from: number, to: number) => Promise<PagedResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < 200; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw new Error(error.message || 'Erro ao buscar dados paginados');
    }

    const batch = data || [];
    rows.push(...batch);

    if (batch.length < pageSize) {
      return rows;
    }
  }

  return rows;
}

export function dedupeRowsById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();

  for (const row of rows) {
    map.set(row.id, row);
  }

  return Array.from(map.values());
}