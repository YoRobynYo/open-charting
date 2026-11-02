/**
 * open-charting — an embeddable trading terminal.
 *
 * ```tsx
 * import { OpenChartsProvider, Terminal } from "open-charting";
 * import { createDemoAdapter } from "open-charting/demo";
 * import "open-charting/style.css";
 *
 * <OpenChartsProvider adapter={createDemoAdapter()}>
 *   <Terminal />
 * </OpenChartsProvider>;
 * ```
 *
 * Point it at your own backend by implementing `OpenChartsAdapter`, and compose
 * your own layout from the individual panels. Neither requires forking.
 */
export * from "./adapter/index.ts";
export * from "./terminal/index.ts";
export type { OpenChartsProviderProps } from "./adapter/provider.tsx";
export { onNotification, type Notification } from "./notifications.ts";
export type { Candle, Order, Position, Symbol, PlaceOrderInput } from "./services/schemas.ts";
