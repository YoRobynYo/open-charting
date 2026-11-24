import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  LayoutGrid,
  MoreHorizontal,
  Repeat2,
  X,
  Zap,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAuthStore } from "../../services/store.tsx";
import { usePlaceOrder } from "../../services/queries.ts";
import { readTraderPrefs } from "../../hooks/useTraderPreferences.ts";
import { Button } from "../../components/ui/button.tsx";
import { DisconnectedTradingBanner } from "../../components/ConnectionIndicator.tsx";
import type { PlaceOrderInput } from "../../services/schemas.ts";
import { toast } from "../../services/toast.ts";
import { formatCurrency, formatNumber, cn } from "../../lib/utils.ts";
import { DOMPanel } from "./DOMPanel.tsx";

type ConfirmableOrder = PlaceOrderInput & { _submit: () => Promise<unknown> };

export interface OrderPanelProps {
  symbol: string;
  symbolInfo?: {
    name?: string;
    description?: string;
    pipSize?: number;
    pricescale?: number;
    contractSize?: number;
    marginPercent?: number;
    commission?: number;
    [k: string]: unknown;
  };
  tick?: { bid: number; ask: number; timestamp: number };
  accountId: string | null;
  oneClick?: boolean;
  onToggleOneClick?: () => void;
  onConfirmOrder?: (order: ConfirmableOrder) => void;
  accountBalance?: number;
  isFeedConnected?: boolean;
  soundMuted?: boolean;
  onToggleMute?: () => void;
  onOrderSuccess?: () => void;
  /** Optional: control the panel's open/closed state from the parent. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional: handler for the grid "+" button in the header. */
  onAddWidget?: () => void;
}

/** A take-profit / stop-loss entry: toggled on/off, typed as a price or a % move. */
type Exit = { on: boolean; mode: "price" | "pct"; value: string };
const EXIT_OFF: Exit = { on: false, mode: "price", value: "" };

const labelCls = "text-xs text-muted-foreground";
const fieldCls =
  "flex items-center gap-2 h-10 px-3 rounded-lg border border-border bg-background/40 focus-within:border-primary";
const bareInput =
  "flex-1 min-w-0 !bg-transparent !border-0 !p-0 !shadow-none !outline-none text-sm font-mono";

export function OrderPanel({
  symbol,
  symbolInfo,
  tick,
  accountId,
  oneClick,
  onToggleOneClick,
  onConfirmOrder,
  accountBalance,
  isFeedConnected = true,
  soundMuted,
  onToggleMute,
  onOrderSuccess,
  open: openProp,
  onOpenChange,
  onAddWidget,
}: OrderPanelProps) {
  const isDemo = useAuthStore((s) => s.isDemo);
  const [openState, setOpenState] = useState(true);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange?.(v);
  };
  const [menu, setMenu] = useState(false);
  const [tab, setTab] = useState<"order" | "dom">("order");
  const [extraOpen, setExtraOpen] = useState(false);
  const [exitsOpen, setExitsOpen] = useState(true);

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "STOP">("MARKET");
  const [quantity, setQuantity] = useState(() => {
    const prefs = readTraderPrefs();
    const raw = prefs.defaultQty;
    if (raw) {
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n > 0) return String(Math.round(n * 100) / 100);
    }
    return "0.1";
  });
  const [pct, setPct] = useState(0);
  const [price, setPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [tp, setTp] = useState<Exit>(EXIT_OFF);
  const [sl, setSl] = useState<Exit>(EXIT_OFF);

  const placeOrder = usePlaceOrder();

  // ---- price helpers -------------------------------------------------------
  const pricescale = symbolInfo?.pricescale && symbolInfo.pricescale > 0 ? symbolInfo.pricescale : 100000;
  const digits = Math.max(0, Math.round(Math.log10(pricescale)));
  const point = 1 / pricescale;
  const livePrice = tick ? (side === "BUY" ? tick.ask : tick.bid) : null;
  const spreadPts = tick ? Math.round((tick.ask - tick.bid) / point) : 0;

  const entryStr = orderType === "STOP" ? stopPrice : price;
  const setEntryStr = orderType === "STOP" ? setStopPrice : setPrice;
  const typedEntry = parseFloat(entryStr);
  const refPrice =
    orderType !== "MARKET" && Number.isFinite(typedEntry) && typedEntry > 0
      ? typedEntry
      : livePrice;
  const offsetPts =
    refPrice != null && tick ? Math.round((refPrice - tick.ask) / point) : 0;

  // ---- exits ---------------------------------------------------------------
  const tpDir = side === "BUY" ? 1 : -1;
  const exitToPrice = (e: Exit, dir: 1 | -1): number | undefined => {
    if (!e.on || e.value === "") return undefined;
    const n = parseFloat(e.value);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    if (e.mode === "price") return n;
    return refPrice != null ? refPrice * (1 + (dir * n) / 100) : undefined;
  };
  const takeProfitPrice = exitToPrice(tp, tpDir as 1 | -1);
  const stopLossPrice = exitToPrice(sl, (-tpDir) as 1 | -1);

  const swapExitMode = (e: Exit, set: (x: Exit) => void, dir: 1 | -1) => {
    const n = parseFloat(e.value);
    if (!Number.isFinite(n) || refPrice == null) {
      set({ ...e, mode: e.mode === "price" ? "pct" : "price" });
    } else if (e.mode === "price") {
      set({ ...e, mode: "pct", value: Math.abs(((n - refPrice) / refPrice) * 100).toFixed(2) });
    } else {
      set({ ...e, mode: "price", value: (refPrice * (1 + (dir * n) / 100)).toFixed(digits) });
    }
  };

  // ---- size / margin -------------------------------------------------------
  const qtyVal = parseFloat(quantity) || 0;
  const contractSize = symbolInfo?.contractSize || 100000;
  const marginPct = symbolInfo?.marginPercent ?? 0;
  const tradeValue = refPrice != null ? qtyVal * contractSize * refPrice : 0;
  const marginRequired = tradeValue * (marginPct / 100);
  const marginPerLot = refPrice != null ? contractSize * refPrice * (marginPct / 100) : 0;
  const balance = accountBalance || 0;
  const leverageLabel = marginPct > 0 ? ` (${Math.round(100 / marginPct)}x)` : "";
  const canSlide = marginPerLot > 0 && balance > 0;

  const onQuantity = (v: string) => {
    setQuantity(v);
    if (canSlide) {
      const used = ((parseFloat(v) || 0) * marginPerLot) / balance;
      setPct(Math.max(0, Math.min(100, Math.round(used * 100))));
    }
  };
  const onSlide = (p: number) => {
    setPct(p);
    if (!canSlide) return;
    const lots = Math.floor(((p / 100) * balance * 100) / marginPerLot) / 100;
    setQuantity(String(Math.min(1000, Math.max(0.01, lots))));
  };

  const resetTicket = () => {
    setOrderType("MARKET");
    setPrice("");
    setStopPrice("");
    setQuantity("0.1");
    setPct(0);
    setTp(EXIT_OFF);
    setSl(EXIT_OFF);
    setMenu(false);
  };

  // ---- submit (unchanged behaviour) ---------------------------------------
  const handleSubmit = () => {
    if (!isFeedConnected) {
      toast.warning("No Data Feed", "Cannot place orders while disconnected from the data feed");
      return;
    }
    if (!accountId) {
      toast.warning("No Account", "Please select a trading account first");
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.warning("Invalid Quantity", "Quantity must be a positive number");
      return;
    }
    if (qty > 1000) {
      toast.warning("Invalid Quantity", "Maximum quantity is 1000 lots");
      return;
    }
    if (orderType === "LIMIT" && (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0)) {
      toast.warning("Missing Price", "Limit orders require a valid price");
      return;
    }
    if (
      orderType === "STOP" &&
      (!stopPrice || isNaN(parseFloat(stopPrice)) || parseFloat(stopPrice) <= 0)
    ) {
      toast.warning("Missing Stop Price", "Stop orders require a valid stop price");
      return;
    }
    const effectiveType = orderType;

    const input: PlaceOrderInput = {
      accountId,
      symbol,
      side,
      type: effectiveType as PlaceOrderInput["type"],
      quantity: qty,
    };

    if (orderType === "LIMIT" && price) input.price = parseFloat(price);
    if (orderType === "STOP" && stopPrice) input.stopPrice = parseFloat(stopPrice);
    if (takeProfitPrice) input.takeProfit = takeProfitPrice;
    if (stopLossPrice) input.stopLoss = stopLossPrice;

    const doSubmit = () =>
      placeOrder.mutateAsync(input, {
        onSuccess: () => {
          toast.success("Order Sent", `${side} ${qty} ${symbol} (${effectiveType})`);
          onOrderSuccess?.();
        },
        onError: (err: unknown) => {
          const e = err as {
            error?: { code?: string; message?: string };
            message?: string;
            code?: string;
          };
          const code = e?.error?.code ?? e?.code;
          const msg = e?.error?.message || e?.message || "Failed to place order";
          if (code === "ACCOUNT_PASSED") {
            toast.success("Account Passed!", msg);
          } else if (code === "ACCOUNT_FAILED") {
            toast.error("Account Failed", msg);
          } else if (code === "REQUEST_TIMEOUT") {
            toast.error(
              "Order Timed Out",
              "The server didn't respond in time. Check your connection and try again.",
            );
          } else {
            toast.error("Order Failed", msg);
          }
        },
      });

    if (oneClick && orderType === "MARKET") {
      doSubmit().catch(() => {});
      return;
    }

    if (onConfirmOrder) {
      onConfirmOrder({
        accountId,
        symbol,
        side,
        type: effectiveType,
        quantity: qty,
        price: input.price,
        stopPrice: input.stopPrice,
        takeProfit: input.takeProfit,
        stopLoss: input.stopLoss,
        _submit: doSubmit,
      });
      return;
    }

    // onError already toasts the reason — absorb the rejection so it does not
    // surface as an unhandled promise.
    doSubmit().catch(() => {});
  };

  const quickQty = [0.01, 0.05, 0.1, 0.5, 1.0];
  const sideColor = side === "BUY" ? "text-buy" : "text-sell";
  const sideBg = side === "BUY" ? "bg-buy" : "bg-sell";

  // ---- collapsed rail ------------------------------------------------------
  if (!open) {
    return (
      <div className="flex flex-col items-center h-full w-9 border-l border-border bg-background">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open order panel"
          title="Open order panel"
          className="flex flex-col items-center gap-3 pt-3 w-full text-muted-foreground hover:text-foreground"
        >
          <span className="grid place-items-center h-6 w-6 rounded-md bg-buy text-[10px] font-extrabold text-black">
            OC
          </span>
          <span className="text-xs [writing-mode:vertical-rl]">{symbol}</span>
        </button>
      </div>
    );
  }

  const exitRow = (
    label: string,
    e: Exit,
    set: (x: Exit) => void,
    dir: 1 | -1,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {label} {e.mode === "pct" ? "%" : "price"}
        </span>
        <button
          role="switch"
          aria-checked={e.on}
          aria-label={`${label} on/off`}
          onClick={() => set({ ...e, on: !e.on })}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors",
            e.on ? sideBg : "bg-muted",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
              e.on && "translate-x-5",
            )}
          />
        </button>
      </div>
      <div className={cn(fieldCls, !e.on && "opacity-50")}>
        <input
          type="number"
          disabled={!e.on}
          value={e.value}
          onChange={(ev) => set({ ...e, value: ev.target.value })}
          placeholder={e.mode === "price" ? (refPrice != null ? formatNumber(refPrice, digits) : "") : "0.00"}
          className={bareInput}
          step={e.mode === "price" ? String(point) : "0.01"}
        />
        <button
          disabled={!e.on}
          onClick={() => swapExitMode(e, set, dir)}
          title="Switch between price and %"
          aria-label="Switch between price and percent"
          className="text-muted-foreground hover:text-foreground"
        >
          <Repeat2 className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground w-10 text-right">
          {e.mode === "price" ? "price" : "%"}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full relative" data-testid="order-form">
      {/* Header: brand + symbol on the left, actions on the right */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-label="OpenC"
            className={cn(
              "grid place-items-center h-7 w-7 shrink-0 rounded-lg text-[12px] font-extrabold text-black",
              sideBg,
            )}
          >
            OC
          </span>
          <span className="text-base font-semibold truncate">{symbol}</span>
          {oneClick && <Zap className="h-3.5 w-3.5 text-buy shrink-0" aria-label="1-Click on" />}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <button
            onClick={onAddWidget}
            aria-label="Add widget"
            title="Add widget"
            className="p-1.5 rounded-md hover:bg-secondary hover:text-foreground"
          >
            <LayoutGrid className="h-5 w-5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={menu}
              title="More"
              className="p-1.5 rounded-md hover:bg-secondary hover:text-foreground"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 min-w-[190px] rounded-lg border border-border bg-secondary p-1 text-sm text-foreground shadow-lg"
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      onToggleOneClick?.();
                      setMenu(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 hover:bg-border"
                  >
                    <Zap className="h-4 w-4" />
                    1-Click trading: {oneClick ? "on" : "off"}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      onToggleMute?.();
                      setMenu(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 hover:bg-border"
                  >
                    {soundMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    Sound: {soundMuted ? "off" : "on"}
                  </button>
                  <button
                    role="menuitem"
                    onClick={resetTicket}
                    className="w-full rounded-md px-3 py-2 text-left hover:bg-border"
                  >
                    Reset ticket
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setOpen(false);
                    }}
                    className="w-full rounded-md px-3 py-2 text-left hover:bg-border"
                  >
                    Close panel
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close order panel"
            title="Close"
            className="p-1.5 rounded-md hover:bg-secondary hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Order / DOM */}
      <div className="px-3 pt-3">
        <div className="grid grid-cols-2 rounded-lg bg-secondary p-0.5 text-sm">
          {(["order", "dom"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md py-1.5",
                tab === t ? "bg-border text-foreground" : "text-muted-foreground",
              )}
            >
              {t === "order" ? "Order" : "DOM"}
            </button>
          ))}
        </div>
      </div>

      {tab === "dom" ? (
        <div className="flex-1 overflow-y-auto mt-3">
          <DOMPanel symbol={symbol} tick={tick} />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Sell | spread | Buy */}
            <div className="relative grid grid-cols-2 overflow-hidden rounded-xl bg-secondary">
              <button
                onClick={() => setSide("SELL")}
                className={cn(
                  "flex flex-col px-3.5 py-2.5 text-left",
                  side === "SELL" && "bg-sell/20 text-sell",
                )}
              >
                <span className="text-sm">Sell</span>
                <span className="text-lg font-mono">{tick ? formatNumber(tick.bid, digits) : "—"}</span>
              </button>
              <button
                onClick={() => setSide("BUY")}
                className={cn(
                  "flex flex-col items-end px-3.5 py-2.5 text-right",
                  side === "BUY" && "bg-buy/20 text-buy",
                )}
              >
                <span className="text-sm">Buy</span>
                <span className="text-lg font-mono">{tick ? formatNumber(tick.ask, digits) : "—"}</span>
              </button>
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black px-2 py-0.5 text-xs font-mono">
                {spreadPts.toFixed(1)}
              </span>
            </div>

            {/* Market / Limit / Stop */}
            <div role="tablist" className="grid grid-cols-3 border-b-2 border-border">
              {(["MARKET", "LIMIT", "STOP"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={orderType === t}
                  onClick={() => setOrderType(t)}
                  className={cn(
                    "-mb-0.5 border-b-2 py-2 text-sm",
                    orderType === t
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  {t[0] + t.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Price */}
            <div className="space-y-1.5">
              <label className={labelCls}>{orderType === "STOP" ? "Stop price" : "Price"}</label>
              <div className={cn(fieldCls, orderType === "MARKET" && "opacity-60")}>
                <input
                  type="number"
                  disabled={orderType === "MARKET"}
                  value={orderType === "MARKET" ? (livePrice != null ? livePrice.toFixed(digits) : "") : entryStr}
                  onChange={(e) => setEntryStr(e.target.value)}
                  placeholder={livePrice != null ? formatNumber(livePrice, digits) : ""}
                  className={bareInput}
                  step={String(point)}
                />
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {orderType === "MARKET"
                    ? "Market"
                    : `Ask ${offsetPts < 0 ? "–" : "+"} ${Math.abs(offsetPts)}`}
                </span>
              </div>
            </div>

            {/* Volume */}
            <div className="space-y-1.5">
              <label className={labelCls}>Volume (lots)</label>
              <div className={fieldCls}>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => onQuantity(e.target.value)}
                  className={bareInput}
                  step="0.01"
                  min="0.01"
                />
                <span className="text-xs text-muted-foreground">lots</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={25}
                  value={pct}
                  disabled={!canSlide}
                  onChange={(e) => onSlide(Number(e.target.value))}
                  aria-label="Percent of balance"
                  title={canSlide ? "Percent of balance used as margin" : "Needs symbol margin info"}
                  className={cn("flex-1 accent-current", sideColor, !canSlide && "opacity-40")}
                />
                <span className="min-w-[3.25rem] rounded-md bg-secondary px-2.5 py-1 text-center text-sm">
                  {pct}%
                </span>
              </div>
              <div className="flex gap-1">
                {quickQty.map((q) => (
                  <button
                    key={q}
                    onClick={() => onQuantity(String(q))}
                    className={cn(
                      "flex-1 rounded border border-border py-0.5 text-[11px]",
                      parseFloat(quantity) === q ? "bg-secondary" : "hover:bg-secondary/50",
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Trade value / margin */}
            {symbolInfo && tick && (
              <div className="space-y-2 rounded-xl bg-secondary p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trade value{leverageLabel}</span>
                  <span className="font-mono">{formatCurrency(tradeValue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Margin required</span>
                  <span className="font-mono">{formatCurrency(marginRequired)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Balance</span>
                  <span className="font-mono">{formatCurrency(balance)}</span>
                </div>
              </div>
            )}

            {/* Exits */}
            <button
              onClick={() => setExitsOpen((o) => !o)}
              aria-expanded={exitsOpen}
              className="flex w-full items-center justify-between pt-1 text-sm font-semibold"
            >
              Exits
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", exitsOpen && "rotate-180")} />
            </button>
            {exitsOpen && (
              <div className="space-y-3">
                {exitRow("Take profit", tp, setTp, tpDir as 1 | -1)}
                {exitRow("Stop loss", sl, setSl, (-tpDir) as 1 | -1)}
              </div>
            )}

            {/* Risk-per-trade display */}
            {(() => {
              const slVal = stopLossPrice;
              const tpVal = takeProfitPrice;
              const currentPrice = refPrice;

              if (!currentPrice || !slVal || qtyVal <= 0) return null;

              const slDistance = Math.abs(currentPrice - slVal);
              const riskDollar = slDistance * qtyVal * contractSize;
              const riskPct = balance > 0 ? (riskDollar / balance) * 100 : 0;
              const tpDollar = tpVal ? Math.abs(tpVal - currentPrice) * qtyVal * contractSize : null;
              const rrRatio = tpDollar && riskDollar > 0 ? tpDollar / riskDollar : null;

              const riskColor =
                riskPct > 5 ? "text-destructive" : riskPct > 2 ? "text-warning" : "text-buy";

              return (
                <div className="bg-secondary/50 rounded p-2 text-[10px] space-y-1 border border-border/50">
                  <div className="flex items-center gap-1 mb-1">
                    <AlertTriangle className={cn("h-3 w-3", riskColor)} />
                    <span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">
                      Risk Analysis
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk Amount</span>
                    <span className={cn("font-mono font-semibold", riskColor)}>
                      {formatCurrency(riskDollar)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk % of Balance</span>
                    <span className={cn("font-mono font-semibold", riskColor)}>
                      {riskPct.toFixed(2)}%
                    </span>
                  </div>
                  {tpDollar != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reward</span>
                      <span className="font-mono text-buy">{formatCurrency(tpDollar)}</span>
                    </div>
                  )}
                  {rrRatio != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">R:R Ratio</span>
                      <span
                        className={cn(
                          "font-mono font-semibold",
                          rrRatio >= 2 ? "text-buy" : rrRatio >= 1 ? "text-foreground" : "text-sell",
                        )}
                      >
                        1:{rrRatio.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {riskPct > 5 && (
                    <div className="text-destructive text-[9px] flex items-center gap-1 mt-1">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      High risk — exceeds 5% of balance
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Extra settings */}
            <button
              onClick={() => setExtraOpen((o) => !o)}
              aria-expanded={extraOpen}
              className="flex w-full items-center justify-between pt-1 text-sm font-semibold"
            >
              Extra settings
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", extraOpen && "rotate-180")} />
            </button>
            {extraOpen && symbolInfo && (
              <div className="space-y-1 rounded-lg bg-secondary p-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contract Size</span>
                  <span>{symbolInfo.contractSize?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Commission</span>
                  <span>{formatCurrency((symbolInfo.commission ?? 0) * qtyVal)}</span>
                </div>
              </div>
            )}

            {placeOrder.isError && (
              <p className="text-destructive text-xs mt-1 p-1.5 bg-destructive/10 rounded">
                {(placeOrder.error as { message?: string } | null)?.message || "Order failed"}
              </p>
            )}
            {placeOrder.isSuccess && (
              <p className="text-buy text-xs mt-1 p-1.5 bg-buy/10 rounded">Order placed successfully</p>
            )}
          </div>

          {/* Pinned footer: banners + confirm button */}
          <div className="space-y-2 border-t border-border p-3">
            {isDemo && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 text-center">
                <p className="text-amber-400 text-[10px] font-semibold uppercase tracking-wider">
                  Demo Mode
                </p>
                <p className="text-muted-foreground text-[10px] mt-0.5">
                  Trading is disabled in demo mode
                </p>
              </div>
            )}
            {!isDemo && !isFeedConnected && <DisconnectedTradingBanner />}
            <Button
              variant={side === "BUY" ? "buy" : "sell"}
              className="h-auto w-full flex-col gap-0 py-2.5"
              onClick={handleSubmit}
              loading={placeOrder.isPending}
              disabled={!accountId || placeOrder.isPending || isDemo || !isFeedConnected}
            >
              {isDemo ? (
                "Demo — Trading Disabled"
              ) : !isFeedConnected ? (
                "Disconnected — Trading Disabled"
              ) : placeOrder.isPending ? (
                "Placing…"
              ) : (
                <>
                  <span className="text-base font-semibold">{side === "BUY" ? "Buy" : "Sell"}</span>
                  <span className="text-xs font-normal opacity-90">
                    {quantity} {symbol} @{" "}
                    {orderType === "MARKET"
                      ? "MARKET"
                      : `${refPrice != null ? formatNumber(refPrice, digits) : ""} ${orderType}`}
                  </span>
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
