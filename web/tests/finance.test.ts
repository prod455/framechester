import assert from "node:assert/strict";
import { test } from "node:test";
import { cashSummary, money, recordedMoney } from "../shared/finance.ts";
import type { RevenueEntry } from "../shared/types.ts";

function receipt(values: Partial<RevenueEntry>): RevenueEntry {
  return {
    id: "financial-fixture",
    channelId: "science",
    platform: "youtube",
    kind: "payment",
    amountCents: 0,
    currency: "BRL",
    date: "2026-10-27",
    note: "Synthetic test entry",
    source: "manual",
    createdAt: "2026-10-27T12:00:00Z",
    updatedAt: "2026-10-27T12:00:00Z",
    ...values,
  };
}

test("cash includes payments and costs across networks only for the selected channel, excluding estimates", () => {
  const entries = [
    receipt({ platform: "youtube", amountCents: 10_000 }),
    receipt({ platform: "facebook", amountCents: 2_000 }),
    receipt({ platform: "instagram", kind: "cost", amountCents: 2_500 }),
    receipt({ channelId: "another-channel", amountCents: 90_000 }),
    receipt({ channelId: "another-channel", kind: "cost", amountCents: 8_000 }),
    receipt({ kind: "estimate", amountCents: 999_999 }),
  ];
  assert.deepEqual(cashSummary(entries, "science"), [{
    currency: "BRL",
    payments: { status: "safe", cents: 12_000 },
    costs: { status: "safe", cents: 2_500 },
    balance: { status: "safe", cents: 9_500 },
  }]);
});

test("different currencies retain independent balances without an implicit conversion", () => {
  const entries = [
    receipt({ currency: "USD", amountCents: 5_000 }),
    receipt({ currency: "USD", kind: "cost", amountCents: 1_250 }),
    receipt({ currency: "BRL", amountCents: 10_000 }),
    receipt({ currency: "BRL", kind: "cost", amountCents: 12_500 }),
  ];
  assert.deepEqual(cashSummary(entries, "science"), [
    { currency: "BRL", payments: { status: "safe", cents: 10_000 }, costs: { status: "safe", cents: 12_500 }, balance: { status: "safe", cents: -2_500 } },
    { currency: "USD", payments: { status: "safe", cents: 5_000 }, costs: { status: "safe", cents: 1_250 }, balance: { status: "safe", cents: 3_750 } },
  ]);
});

test("a missing payment or cost category leaves the cash balance unknown in that currency", () => {
  const summaries = cashSummary([
    receipt({ amountCents: 2_000 }),
    receipt({ currency: "USD", kind: "cost", amountCents: 700 }),
  ], "science");
  assert.deepEqual(summaries[0].payments, { status: "safe", cents: 2_000 });
  assert.deepEqual(summaries[0].costs, { status: "empty" });
  assert.deepEqual(summaries[0].balance, { status: "empty" });
  assert.deepEqual(summaries[1].payments, { status: "empty" });
  assert.deepEqual(summaries[1].costs, { status: "safe", cents: 700 });
  assert.deepEqual(summaries[1].balance, { status: "empty" });
});

test("an explicitly recorded zero is distinct from an unknown category", () => {
  const [summary] = cashSummary([receipt({ amountCents: 0 }), receipt({ kind: "cost", amountCents: 0 })], "science");
  assert.deepEqual(summary.payments, { status: "safe", cents: 0 });
  assert.deepEqual(summary.costs, { status: "safe", cents: 0 });
  assert.deepEqual(summary.balance, { status: "safe", cents: 0 });
  assert.equal(recordedMoney(summary.balance, "BRL"), "R$\u00a00,00");
  assert.equal(recordedMoney({ status: "empty" }, "BRL"), "—");
});

test("no records, estimates alone and another channel do not create a cash total", () => {
  assert.deepEqual(cashSummary([], "science"), []);
  assert.deepEqual(cashSummary([receipt({ kind: "estimate", amountCents: 1_000 })], "science"), []);
  assert.deepEqual(cashSummary([receipt({ channelId: "other", amountCents: 1_000 })], "science"), []);
});

test("overflow blocks the total and known balance instead of rounding money", () => {
  const [summary] = cashSummary([
    receipt({ amountCents: Number.MAX_SAFE_INTEGER }),
    receipt({ amountCents: 1 }),
    receipt({ kind: "cost", amountCents: 0 }),
  ], "science");
  assert.deepEqual(summary.payments, { status: "overflow" });
  assert.deepEqual(summary.costs, { status: "safe", cents: 0 });
  assert.deepEqual(summary.balance, { status: "overflow" });
  assert.equal(recordedMoney(summary.payments, "BRL"), "Fora do limite");
});

test("safe integer boundary retains every cent in totals and formatted currency", () => {
  const [summary] = cashSummary([
    receipt({ amountCents: Number.MAX_SAFE_INTEGER }),
    receipt({ kind: "cost", amountCents: 1 }),
  ], "science");
  assert.deepEqual(summary.payments, { status: "safe", cents: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(summary.balance, { status: "safe", cents: 9_007_199_254_740_990 });
  assert.equal(recordedMoney(summary.payments, "BRL"), "R$\u00a090.071.992.547.409,91");
  assert.equal(money(9_007_199_254_740_990, "BRL"), "R$\u00a090.071.992.547.409,90");
});

test("invalid cent amounts never become a financial total", () => {
  for (const amountCents of [Number.MAX_SAFE_INTEGER + 1, 1.25, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const [summary] = cashSummary([receipt({ amountCents }), receipt({ kind: "cost", amountCents: 0 })], "science");
    assert.deepEqual(summary.payments, { status: "overflow" });
    assert.deepEqual(summary.balance, { status: "overflow" });
  }
});

test("currency formatting preserves missing values, cents and a negative cash balance", () => {
  assert.equal(money(null), "—");
  assert.equal(money(undefined), "—");
  assert.equal(money(1), "R$\u00a00,01");
  assert.equal(money(-2_501), "−R$\u00a025,01");
  assert.equal(money(Number.MAX_SAFE_INTEGER + 1), "Fora do limite");
});
