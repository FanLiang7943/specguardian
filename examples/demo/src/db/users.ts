import { query } from "./client";

export interface UserRow {
  id: string;
  name: string;
  email: string;
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  const rows = await query<UserRow>("select id, name, email from users where id = $1", [id]);
  return rows[0];
}
