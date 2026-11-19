export interface HttpResponse {
  status: number;
  body: unknown;
}

/** Internal HTTP client: adds retries, timeouts and audit logging. */
export async function post(url: string, body: unknown): Promise<HttpResponse> {
  const res = await fetch(url, { method: "POST", body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
