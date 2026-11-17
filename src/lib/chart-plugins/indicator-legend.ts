export interface IndicatorLegendItem {
  label: string;
  color: string;
  shape: "dot" | "line" | "candle";
}

export const ICT_TRADE_SETUP_LEGEND: IndicatorLegendItem[] = [
  { label: "Liquidity", color: "#a78bfa", shape: "dot" },
  { label: "Sweep confirmed", color: "#fb923c", shape: "dot" },
  { label: "BOS", color: "#22c55e", shape: "line" },
  { label: "CHoCH", color: "#f43f5e", shape: "line" },
  { label: "Retest / paper candidate", color: "#22c55e", shape: "dot" },
  { label: "Invalidated", color: "#f43f5e", shape: "dot" },
];

export const ICT_CANDLE_PATTERN_LEGEND: IndicatorLegendItem[] = [
  { label: "Hammer", color: "#22d3ee", shape: "candle" },
  { label: "Inverted Hammer", color: "#67e8f9", shape: "candle" },
  { label: "Shooting Star", color: "#f59e0b", shape: "candle" },
  { label: "Hanging Man", color: "#fbbf24", shape: "candle" },
  { label: "Bullish Engulfing", color: "#39ff14", shape: "candle" },
  { label: "Bearish Engulfing", color: "#ff3b5c", shape: "candle" },
  { label: "Morning Star", color: "#4ade80", shape: "candle" },
  { label: "Evening Star", color: "#fb7185", shape: "candle" },
  { label: "Bullish Marubozu", color: "#16a34a", shape: "candle" },
  { label: "Bearish Marubozu", color: "#dc2626", shape: "candle" },
  { label: "BOS breakout", color: "#22c55e", shape: "line" },
  { label: "CHoCH breakout", color: "#f43f5e", shape: "line" },
];
