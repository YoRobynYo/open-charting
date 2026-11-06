import type {
  CandleRequest,
  ConnectionState,
  MarketDataSource,
  MarketEvent,
  OpenChartsAdapter,
  Quote,
} from "../../src/adapter/types.ts";
import type { Candle, Symbol } from "../../src/services/schemas.ts";

/**
 * Public Coinbase Exchange market data for open-charting.
 * No API key is needed for these public REST and WebSocket market-data feeds.
 * Trading remains paper-only by composing the feed with the bundled demo engine.
 */
const REST_BASE = "https://api.exchange.coinbase.com";
const WS_URL = "wss://ws-feed.exchange.coinbase.com";

const SYMBOL_MAP: Record<string, { product: string; label: string; tickSize: number }> = {
  BTCUSD: { product: "BTC-USD", label: "Bitcoin", tickSize: 0.01 },
  ETHUSD: { product: "ETH-USD", label: "Ethereum", tickSize: 0.01 },
  SOLUSD: { product: "SOL-USD", label: "Solana", tickSize: 0.01 },
  BNBUSD: { product: "BNB-USD", label: "BNB", tickSize: 0.01 },
  XRPUSD: { product: "XRP-USD", label: "XRP", tickSize: 0.0001 },
  ADAUSD: { product: "ADA-USD", label: "Cardano", tickSize: 0.00001 },
};

const PRODUCT_TO_SYMBOL = new Map(
  Object.entries(SYMBOL_MAP).map(([symbol, spec]) => [spec.product, symbol]),
);

const TARGET_INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1_800,
  "1h": 3_600,
  "4h": 14_400,
  "1d": 86_400,
  "1w": 604_800,
};

const SOURCE_TIMEFRAME: Record<string, string> = {
  "30m": "15m",
  "4h": "1h",
  "1w": "1d",
};

const GRANULARITY_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
  "1d": 86_400,
};

const MAX_CANDLES_PER_REQUEST = 300;
const MAX_RETURNED_CANDLES = 1_000;

export function toCoinbaseProduct(symbol: string): string | null {
  return SYMBOL_MAP[symbol]?.product ?? null;
}

export function fromCoinbaseProduct(product: string): string | null {
  return PRODUCT_TO_SYMBOL.get(product.toUpperCase()) ?? null;
}

export type CoinbaseCandle = [
  time: number,
  low: number,
  high: number,
  open: number,
  close: number,
  volume: number,
];

/** Coinbase candles are [seconds, low, high, open, close, volume]. */
export function coinbaseCandleToCandle(row: CoinbaseCandle): Candle {
  return {
    time: row[0],
    open: Number(row[3]),
    high: Number(row[2]),
    low: Number(row[1]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

export function buildCoinbaseCandlesUrl(
  symbol: string,
  timeframe: string,
  startMs: number,
  endMs: number,
): string | null {
  const product = toCoinbaseProduct(symbol);
  const granularity = GRANULARITY_SECONDS[timeframe];
  if (!product || !granularity || endMs <= startMs) return null;
  const params = new URLSearchParams({
    granularity: String(granularity),
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  });
  return `${REST_BASE}/products/${encodeURIComponent(product)}/candles?${params.toString()}`;
}

export function buildCoinbaseBookUrl(symbol: string): string | null {
  const product = toCoinbaseProduct(symbol);
  return product
    ? `${REST_BASE}/products/${encodeURIComponent(product)}/book?level=1`
    : null;
}

function candleBucketStart(timeSeconds: number, timeframe: string): number {
  if (timeframe === "1w") {
    const date = new Date(timeSeconds * 1000);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return Math.floor(date.getTime() / 1000);
  }
  const interval = TARGET_INTERVAL_SECONDS[timeframe]!;
  return Math.floor(timeSeconds / interval) * interval;
}

export function aggregateCoinbaseCandles(
  candles: readonly Candle[],
  timeframe: string,
): Candle[] {
  const interval = TARGET_INTERVAL_SECONDS[timeframe];
  if (!interval) return [];
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const buckets = new Map<number, Candle>();
  for (const candle of sorted) {
    const time = candleBucketStart(candle.time, timeframe);
    const existing = buckets.get(time);
    if (!existing) {
      buckets.set(time, { ...candle, time });
      continue;
    }
    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

function symbolSpec(name: string): Symbol {
  const spec = SYMBOL_MAP[name]!;
  return {
    id: name,
    name,
    displayName: spec.label,
    category: "CRYPTO",
    contractSize: 1,
    tickSize: spec.tickSize,
    tickValue: spec.tickSize,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 0,
    swapLong: 0,
    swapShort: 0,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  } as Symbol;
}

export interface CoinbaseOptions {
  /** Restrict the adapter to a subset of the supported display symbols. */
  symbols?: string[];
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected in tests; defaults to the global WebSocket. */
  webSocketImpl?: typeof WebSocket;
  /** Injected in tests so candle-window behavior is deterministic. */
  now?: () => number;
}

function parseTime(value: unknown, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : fallback;
}

export function createCoinbaseMarketData(options: CoinbaseOptions = {}): MarketDataSource {
  const names = (options.symbols ?? Object.keys(SYMBOL_MAP)).filter((symbol) => symbol in SYMBOL_MAP);
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const SocketImpl = options.webSocketImpl ?? globalThis.WebSocket;
  const now = options.now ?? Date.now;
  const handlers = new Set<(event: MarketEvent) => void>();
  const stateListeners = new Set<(state: ConnectionState) => void>();
  let socket: WebSocket | null = null;
  let state: ConnectionState = "disconnected";
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closedByUs = false;

  const setState = (next: ConnectionState) => {
    if (state === next) return;
    state = next;
    for (const listener of [...stateListeners]) {
      try {
        listener(next);
      } catch (error) {
        console.error("[coinbase] connection listener threw", error);
      }
    }
  };

  const emit = (event: MarketEvent) => {
    for (const handler of [...handlers]) {
      try {
        handler(event);
      } catch (error) {
        console.error("[coinbase] subscriber threw", error);
      }
    }
  };

  const open = () => {
    if (socket || names.length === 0) return;
    closedByUs = false;
    setState(reconnectAttempt === 0 ? "connecting" : "reconnecting");
    socket = new SocketImpl(WS_URL);

    socket.onopen = () => {
      reconnectAttempt = 0;
      socket?.send(JSON.stringify({
        type: "subscribe",
        product_ids: names.map((symbol) => SYMBOL_MAP[symbol]!.product),
        channels: ["ticker"],
      }));
      setState("connected");
    };

    socket.onmessage = (message: MessageEvent) => {
      try {
        const data = JSON.parse(String(message.data)) as {
          type?: string;
          product_id?: string;
          best_bid?: string;
          best_ask?: string;
          time?: string;
        };
        if (data.type !== "ticker" || !data.product_id) return;
        const symbol = fromCoinbaseProduct(data.product_id);
        const bid = Number(data.best_bid);
        const ask = Number(data.best_ask);
        if (!symbol || !names.includes(symbol) || !Number.isFinite(bid) || !Number.isFinite(ask)) return;
        if (bid <= 0 || ask < bid) return;
        emit({ type: "tick", symbol, bid, ask, timestamp: parseTime(data.time, now() / 1000) * 1000 });
      } catch {
        // Ignore malformed feed frames; a later valid frame can still be used.
      }
    };

    socket.onclose = () => {
      socket = null;
      if (closedByUs) {
        setState("disconnected");
        return;
      }
      setState("reconnecting");
      const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(open, delay);
    };
    socket.onerror = () => {
      // The close event owns reconnection to avoid creating duplicate sockets.
    };
  };

  return {
    getSymbols: async () => names.map(symbolSpec),

    getCandles: async (request: CandleRequest): Promise<Candle[]> => {
      const product = toCoinbaseProduct(request.symbol);
      const timeframe = request.timeframe;
      const targetSeconds = TARGET_INTERVAL_SECONDS[timeframe];
      const sourceTimeframe = SOURCE_TIMEFRAME[timeframe] ?? timeframe;
      const sourceSeconds = GRANULARITY_SECONDS[sourceTimeframe];
      if (!product || !targetSeconds || !sourceSeconds || !names.includes(request.symbol)) return [];

      const limit = Math.min(MAX_RETURNED_CANDLES, Math.max(1, Math.floor(request.limit ?? 500)));
      const upper = request.toMs ?? now();
      const lower = request.fromMs ?? upper - limit * targetSeconds * 1000;
      if (upper <= lower) return [];
      const sourceMs = sourceSeconds * 1000;
      const start = Math.floor(lower / sourceMs) * sourceMs;
      const end = Math.ceil(upper / sourceMs) * sourceMs;
      const baseCandles = new Map<number, Candle>();

      for (let cursor = start; cursor < end;) {
        const chunkEnd = Math.min(end, cursor + MAX_CANDLES_PER_REQUEST * sourceMs);
        const url = buildCoinbaseCandlesUrl(request.symbol, sourceTimeframe, cursor, chunkEnd - 1);
        if (!url) return [];
        const response = await doFetch(url, { headers: { Accept: "application/json" } });
        if (!response.ok) {
          throw new Error(`Coinbase candles failed: ${response.status} ${response.statusText}`);
        }
        const rows = await response.json() as CoinbaseCandle[];
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (!Array.isArray(row) || row.length < 6 || !Number.isFinite(row[0])) continue;
            const timeMs = Number(row[0]) * 1000;
            if (timeMs < start || timeMs >= end) continue;
            const candle = coinbaseCandleToCandle(row);
            if ([candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)) {
              baseCandles.set(candle.time, candle);
            }
          }
        }
        cursor = chunkEnd;
      }

      let result = aggregateCoinbaseCandles([...baseCandles.values()], timeframe)
        .filter((candle) => candle.time * 1000 >= lower && candle.time * 1000 < upper);
      if (result.length > limit) result = result.slice(-limit);
      return result;
    },

    getQuote: async (symbol: string): Promise<Quote | null> => {
      const url = buildCoinbaseBookUrl(symbol);
      if (!url || !names.includes(symbol)) return null;
      const response = await doFetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      const book = await response.json() as { bids?: string[][]; asks?: string[][]; time?: string };
      const bid = Number(book.bids?.[0]?.[0]);
      const ask = Number(book.asks?.[0]?.[0]);
      if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask < bid) return null;
      return { symbol, bid, ask, timestamp: parseTime(book.time, now() / 1000) * 1000 };
    },

    subscribe: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    connect: open,

    disconnect: () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      socket?.close();
      socket = null;
      setState("disconnected");
    },

    getConnectionState: () => state,

    onConnectionChange: (listener) => {
      stateListeners.add(listener);
      listener(state);
      return () => stateListeners.delete(listener);
    },
  };
}

export async function createCoinbasePaperAdapter(
  options: CoinbaseOptions = {},
): Promise<OpenChartsAdapter> {
  const [{ createDemoAdapter }, engine] = await Promise.all([
    import("../../src/adapter/demo.ts"),
    import("../../src/services/demo/engine.ts"),
  ]);
  const marketData = createCoinbaseMarketData(options);
  const paper = createDemoAdapter();
  marketData.subscribe((event) => {
    if (event.type === "tick") engine.mark(event.symbol, (event.bid + event.ask) / 2);
  });
  return {
    name: "coinbase-paper",
    marketData,
    trading: paper.trading,
    storage: paper.storage,
  };
}
