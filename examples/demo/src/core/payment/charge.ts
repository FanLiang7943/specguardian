import { post } from "../../lib/http";

export interface ChargeResult {
  ok: boolean;
  status: number;
}

export async function charge(customerId: string, amountCents: number): Promise<ChargeResult> {
  const res = await post("https://payments.example.com/charges", { customerId, amountCents });
  return { ok: res.status === 200, status: res.status === 200 ? 200 : 402 };
}
