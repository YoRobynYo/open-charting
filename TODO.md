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

- Keep the local workflow simple: one terminal command (`npm run dev:all`) and the chart on port 5173; provider setup is optional.
- The user wants live market prices. Coinbase should be evaluated as a possible market-data alternative to Binance in light of the user's security concerns. No exchange migration is complete until researched, implemented, and tested.

## Status

- **Verified, publishing now:** ICT shows only the latest confirmed high and low labels in view while retaining a neon zigzag through pivots; AI structure also uses an alternating neon zigzag. AI chat text is larger, with an expand/restore button, a draggable panel up to 480 px, and a vertically scrollable chart/AI column when AI is enabled. Typecheck, zero-warning lint, 211 frontend tests, 12 backend tests, and production build passed for the scroll update.
- **Later:** with the user's guidance, evaluate and implement live Coinbase market data.
- **Later:** revisit a keyless educational Chart Coach if the user wants one instead of provider-powered chat.
