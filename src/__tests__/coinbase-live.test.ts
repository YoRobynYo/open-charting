import { describe, it } from "vitest";
import { runAdapterConformance } from "@/adapter/conformance";
import { createCoinbaseMarketData } from "../../examples/coinbase-adapter/coinbase-adapter.ts";

/** Opt-in live test: VITE_LIVE_TESTS=1 npx vitest run src/__tests__/coinbase-live.test.ts */
if (import.meta.env?.VITE_LIVE_TESTS === "1") {
  runAdapterConformance(
    "Coinbase (live)",
    () => ({ marketData: createCoinbaseMarketData({ symbols: ["BTCUSD"] }) }),
    { symbol: "BTCUSD", timeframe: "1m", tickTimeoutMs: 15_000, allowTrading: false },
  );
} else {
  describe("adapter conformance: Coinbase (live)", () => {
    it.skip("set VITE_LIVE_TESTS=1 to run against the public Coinbase API", () => {});
  });
}
