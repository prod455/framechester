import type { RevenueEntry } from "./types.ts";

export type RecordedTotal = { status: "empty" } | { status: "overflow" } | { status: "safe"; cents: number };

export interface CashCurrencySummary {
  currency: string;
  payments: RecordedTotal;
  costs: RecordedTotal;
  balance: RecordedTotal;
}

function recordedTotal(entries: readonly RevenueEntry[]): RecordedTotal {
  if (!entries.length) return { status: "empty" };
  let cents = 0;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amountCents) || entry.amountCents < 0 || entry.amountCents > Number.MAX_SAFE_INTEGER - cents) return { status: "overflow" };
    cents += entry.amountCents;
    if (!Number.isSafeInteger(cents)) return { status: "overflow" };
  }
  return { status: "safe", cents };
}

export function cashSummary(entries: readonly RevenueEntry[], channelId: string): CashCurrencySummary[] {
  const recorded = entries.filter((entry) => entry.channelId === channelId && entry.source === "manual" && (entry.kind === "payment" || entry.kind === "cost"));
  const currencies = [...new Set(recorded.map((entry) => entry.currency))].sort();
  return currencies.map((currency) => {
    const rows = recorded.filter((entry) => entry.currency === currency);
    const payments = recordedTotal(rows.filter((entry) => entry.kind === "payment"));
    const costs = recordedTotal(rows.filter((entry) => entry.kind === "cost"));
    const balance: RecordedTotal = payments.status === "empty" || costs.status === "empty" ? { status: "empty" }
      : payments.status === "overflow" || costs.status === "overflow" ? { status: "overflow" }
      : Number.isSafeInteger(payments.cents - costs.cents) ? { status: "safe", cents: payments.cents - costs.cents } : { status: "overflow" };
    return { currency, payments, costs, balance };
  });
}

export function recordedMoney(total: RecordedTotal, currency: string): string {
  if (total.status === "empty") return "—";
  if (total.status === "overflow" || !Number.isSafeInteger(total.cents)) return "Fora do limite";
  const integer = BigInt(total.cents);
  const absolute = integer < 0n ? -integer : integer;
  const fraction = String(absolute % 100n).padStart(2, "0");
  const whole = absolute / 100n;
  const sign = integer < 0n ? "−" : "";
  try {
    const parts = new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(whole);
    return sign + parts.map((part) => part.type === "fraction" ? fraction : part.value).join("");
  } catch { return `${sign}${new Intl.NumberFormat("pt-BR").format(whole)},${fraction} ${currency}`; }
}

export function money(cents: number | null | undefined, currency = "BRL"): string {
  if (cents == null) return "—";
  if (!Number.isSafeInteger(cents)) return "Fora do limite";
  return recordedMoney({ status: "safe", cents }, currency);
}
