import { describe, expect, it, vi } from "vitest";
import {
  aggregateCoinbaseCandles,
  buildCoinbaseBookUrl,
  buildCoinbaseCandlesUrl,
  coinbaseCandleToCandle,
  createCoinbaseMarketData,
  fromCoinbaseProduct,
  toCoinbaseProduct,
  type CoinbaseCandle,
} from "../../examples/coinbase-adapter/coinbase-adapter.ts";
import type { Candle } from "../../src/services/schemas.ts";

const API_CANDLE: CoinbaseCandle = [1_700_000_040, 41_950, 42_100.5, 42_000.1, 42_050.25, 12.5];

function candle(time: number, open: number, high: number, low: number, close: number, volume = 1): Candle {
  return { time, open, high, low, close, volume };
}

describe("Coinbase product mapping", () => {
  it("maps the six supported USD pairs to Coinbase product IDs", () => {
    expect(toCoinbaseProduct("BTCUSD")).toBe("BTC-USD");
    expect(toCoinbaseProduct("ETHUSD")).toBe("ETH-USD");
    expect(toCoinbaseProduct("SOLUSD")).toBe("SOL-USD");
    expect(toCoinbaseProduct("BNBUSD")).toBe("BNB-USD");
    expect(toCoinbaseProduct("XRPUSD")).toBe("XRP-USD");
    expect(toCoinbaseProduct("ADAUSD")).toBe("ADA-USD");
    expect(fromCoinbaseProduct("btc-usd")).toBe("BTCUSD");
    expect(toCoinbaseProduct("UNKNOWNUSD")).toBeNull();
  });
});

describe("Coinbase URL and candle transforms", () => {
  it("builds a public candles URL using the requested supported granularity", () => {
    const url = buildCoinbaseCandlesUrl("BTCUSD", "1m", 1_700_000_000_000, 1_700_000_060_000)!;
    expect(url).toContain("api.exchange.coinbase.com/products/BTC-USD/candles");
    expect(url).toContain("granularity=60");
    expect(url).toContain("start=2023-11-14T22%3A13%3A20.000Z");
    expect(buildCoinbaseCandlesUrl("BTCUSD", "4h", 1, 2)).toBeNull();
  });

  it("builds a public level-one book URL for the initial best bid and ask", () => {
    expect(buildCoinbaseBookUrl("BTCUSD")).toBe(
      "https://api.exchange.coinbase.com/products/BTC-USD/book?level=1",
    );
    expect(buildCoinbaseBookUrl("UNKNOWNUSD")).toBeNull();
  });

  it("converts Coinbase's low/high/open/close candle order to the app schema", () => {
    expect(coinbaseCandleToCandle(API_CANDLE)).toEqual({
      time: 1_700_000_040,
      open: 42_000.1,
      high: 42_100.5,
      low: 41_950,
      close: 42_050.25,
      volume: 12.5,
    });
  });

  it("aggregates 15-minute candles into 30-minute OHLCV buckets", () => {
    const result = aggregateCoinbaseCandles([
      candle(1_700_000_100, 20, 24, 18, 23, 3),
      candle(1_699_999_200, 10, 15, 8, 12, 2),
      candle(1_700_001_000, 23, 25, 20, 24, 4),
    ], "30m");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ open: 10, high: 24, low: 8, close: 23, volume: 5 });
    expect(result[1]).toMatchObject({ open: 23, high: 25, low: 20, close: 24, volume: 4 });
  });

  it("aggregates four hourly candles into a four-hour bar", () => {
    const start = 1_699_992_000;
    const result = aggregateCoinbaseCandles([
      candle(start + 3_600, 12, 16, 11, 15, 2),
      candle(start, 10, 13, 9, 12, 1),
      candle(start + 7_200, 15, 17, 13, 14, 3),
      candle(start + 10_800, 14, 18, 12, 16, 4),
    ], "4h");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ open: 10, high: 18, low: 9, close: 16, volume: 10 });
  });

  it("starts weekly candles on Monday UTC", () => {
    const sunday = Date.UTC(2023, 10, 19, 12) / 1000;
    const monday = Date.UTC(2023, 10, 13) / 1000;
    expect(aggregateCoinbaseCandles([candle(sunday, 1, 2, 1, 2)], "1w")[0]?.time).toBe(monday);
  });
});

describe("createCoinbaseMarketData", () => {
  it("returns sorted candles and respects an explicit exclusive time window", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        [1_700_000_100, 19, 22, 20, 21, 5],
        [1_700_000_040, 9, 12, 10, 11, 2],
      ],
    }) as unknown as typeof fetch;
    const source = createCoinbaseMarketData({ fetchImpl, now: () => 1_700_000_180_000 });
    const candles = await source.getCandles({
      symbol: "BTCUSD",
      timeframe: "1m",
      fromMs: 1_700_000_040_000,
      toMs: 1_700_000_160_000,
    });

    expect(candles.map((item) => item.time)).toEqual([1_700_000_040, 1_700_000_100]);
    expect(candles[0]?.close).toBe(11);
    expect(candles[1]?.volume).toBe(5);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("splits history requests into Coinbase's 300-candle windows", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
    const source = createCoinbaseMarketData({ fetchImpl, now: () => 1_700_000_000_000 });
    await source.getCandles({ symbol: "BTCUSD", timeframe: "1m", limit: 301 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("parses an initial public level-one quote", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bids: [["75000.25", "0.5", "2"]], asks: [["75000.50", "0.4", "1"]] }),
    }) as unknown as typeof fetch;
    const source = createCoinbaseMarketData({ fetchImpl, now: () => 1_700_000_000_000 });
    expect(await source.getQuote?.("BTCUSD")).toEqual({
      symbol: "BTCUSD",
      bid: 75_000.25,
      ask: 75_000.5,
      timestamp: 1_700_000_000_000,
    });
  });

  it("subscribes to Coinbase ticker updates and emits validated bid/ask ticks", () => {
    class FakeSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      send = vi.fn();
      close = vi.fn();
      static last: FakeSocket | null = null;
      constructor(public url: string) { FakeSocket.last = this; }
    }
    const source = createCoinbaseMarketData({
      symbols: ["BTCUSD"],
      webSocketImpl: FakeSocket as unknown as typeof WebSocket,
    });
    const seen: unknown[] = [];
    source.subscribe((event) => seen.push(event));
    source.connect?.();
    FakeSocket.last!.onopen?.();

    expect(FakeSocket.last?.url).toBe("wss://ws-feed.exchange.coinbase.com");
    expect(FakeSocket.last?.send).toHaveBeenCalledWith(JSON.stringify({
      type: "subscribe",
      product_ids: ["BTC-USD"],
      channels: ["ticker"],
    }));

    FakeSocket.last!.onmessage?.({
      data: JSON.stringify({
        type: "ticker",
        product_id: "BTC-USD",
        best_bid: "75000.25",
        best_ask: "75000.50",
        time: "2023-11-14T22:13:20.000Z",
      }),
    });
    expect(seen).toEqual([{
      type: "tick",
      symbol: "BTCUSD",
      bid: 75_000.25,
      ask: 75_000.5,
      timestamp: 1_700_000_000_000,
    }]);
    source.disconnect?.();
    expect(FakeSocket.last?.close).toHaveBeenCalledOnce();
  });
});
