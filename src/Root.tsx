import { useEffect, useState } from "react";
import { createDemoAdapter } from "./adapter/demo.ts";
import { OpenChartsProvider } from "./adapter/provider.tsx";
import type { OpenChartsAdapter } from "./adapter/types.ts";
import { Terminal } from "./terminal/Terminal.tsx";

/**
 * The hosted demo's root.
 *
 * Deliberately what an integrator would write: install an adapter, render the
 * terminal. Everything else — query cache, market-data stream, notifications,
 * error boundary — comes from `<OpenChartsProvider>`.
 *
 * `VITE_ADAPTER=binance npm run dev` or `VITE_ADAPTER=coinbase npm run dev`
 * swaps in an optional live-market-data example. Both adapters are loaded
 * lazily so neither reaches the default demo bundle.
 */

const adapterMode = import.meta.env.VITE_ADAPTER;
const wantsLiveAdapter = adapterMode === "binance" || adapterMode === "coinbase";

export function Root() {
  const [adapter, setAdapter] = useState<OpenChartsAdapter | null>(() =>
    wantsLiveAdapter ? null : createDemoAdapter(),
  );

  useEffect(() => {
    if (!wantsLiveAdapter) return;
    const loading = adapterMode === "coinbase"
      ? import("../examples/coinbase-adapter/coinbase-adapter.ts")
        .then(({ createCoinbasePaperAdapter }) => createCoinbasePaperAdapter())
      : import("../examples/binance-adapter/binance-adapter.ts")
        .then(({ createBinancePaperAdapter }) => createBinancePaperAdapter());
    loading
      .then(setAdapter)
      .catch((err: unknown) => {
        console.error(`[open-charting] failed to load the ${adapterMode} adapter; using the demo`, err);
        setAdapter(createDemoAdapter());
      });
  }, []);

  if (!adapter) return null;
  return (
    <OpenChartsProvider adapter={adapter}>
      <Terminal />
    </OpenChartsProvider>
  );
}
