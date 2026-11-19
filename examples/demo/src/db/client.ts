export interface Row {
  [column: string]: unknown;
}

export async function query<T extends Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  void sql;
  void params;
  return [];
}
