# open-charting — agreed requirements and next steps

This file preserves the project decisions the user has asked us to keep in view across sessions. Update it as work is completed; do not treat planned items as finished until verified.

## Agreed product direction

- Keep the existing main candlestick/charting page intact. New analysis belongs in separate layers the user can switch on and off.
- The goal is to learn chart and trading mechanics through paper trading, not to optimize for short-term profit.
- Keep the visual style clean, readable, and friendly; avoid dense overlays and tiny explanatory text.
- Use the project name **open-charting** only.

## Chart and ICT layer

- ICT remains an optional layer for BOS, CHoCH, FVG, iFVG, and confirmed swing highs/lows.
- BOS/CHoCH must connect the relevant swing candle to the break candle with a horizontal line; labels on a single candle without the connector are not useful.
- Avoid marking every candle with SH/SL or HH/HL/LH/LL. Show only sparse, meaningful labels and prevent annotation collisions.
- Preserve the diagonal/zigzag structure line between meaningful confirmed swing points. The user specifically prefers the earlier neon zigzag connecting the useful points rather than labels on every turn.

## AI layer and screen layout

- AI analysis remains independently switchable from the ICT layer and must not replace or modify the main chart.
- When enabled, show candidate swing points on the chart and a discussion panel beneath it, with both text and speech controls.
- Keep chart and conversation usable together: when AI is enabled, the chart-and-panel column should scroll vertically so the chart is not permanently compressed to fit the conversation; the AI panel needs readable text, adjustable space, and a quick expand/restore control.
- AI-generated swing ideas must be clearly described as uncertain, not confirmed predictions. Confirmed pivots can be explained from candle data.
- External-provider chat requires the user's own API key; never request that secret in chat. A keyless/rules-based Chart Coach was proposed but still awaits the user's choice.

## Local use and market data

- Keep the local workflow simple and the chart on port 5173; provider setup is optional. The live Coinbase feed can be selected with `VITE_ADAPTER=coinbase npm run dev` and requires no API key.
- The user wants live market prices. Coinbase is an optional market-data alternative to Binance; do not replace the default demo feed unless the user asks.

## Status

- **Published in b01cb6a:** ICT shows only the latest confirmed high and low labels in view while retaining a neon zigzag through pivots; AI structure also uses an alternating neon zigzag. AI chat text is larger, with an expand/restore button, a draggable panel up to 480 px, and a vertically scrollable chart/AI column when AI is enabled. Typecheck, zero-warning lint, 211 frontend tests, 12 backend tests, and production build passed for the scroll update.
- **Verified, ready to publish:** Coinbase Exchange REST candles and public WebSocket bid/ask ticks are available as an opt-in adapter; all six existing crypto pairs are supported, orders remain paper-only, and 30m/4h/weekly candles are aggregated locally. The live read-only conformance suite passed (14 checks), as did typecheck, zero-warning lint, 222 tests plus 12 AI-service backend tests, and production build. The default demo and AI code are unchanged.
- **Later:** revisit a keyless educational Chart Coach if the user wants one instead of provider-powered chat.

## Coinbase research references

- [Coinbase Exchange API overview](https://docs.cdp.coinbase.com/exchange/introduction/welcome): market-data APIs are public; trading/account endpoints require authentication.
- [Coinbase Exchange candle endpoint](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles): candle values arrive as `[time, low, high, open, close, volume]`; granularity choices are 1m, 5m, 15m, 1h, 6h, and 1d; each request is capped at 300 bars. The adapter therefore aggregates 30m, 4h, and weekly bars locally.
- [Coinbase Exchange WebSocket overview](https://docs.cdp.coinbase.com/exchange/websocket-feed/overview) and [ticker channel docs](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels): the traditional market-data feed is unauthenticated; ticker messages provide live updates.
- [Coinbase public REST rate limits](https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits): public endpoints are limited by IP, so candle-history requests are paginated sequentially and should not be polled aggressively.
- A read-only request to the public BTC-USD candle endpoint succeeded during development with HTTP 200 and `Access-Control-Allow-Origin: *`. Product checks returned HTTP 200 for all six current crypto pairs: BTC-USD, ETH-USD, SOL-USD, BNB-USD, XRP-USD, and ADA-USD.
