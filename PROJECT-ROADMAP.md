# Open Charting — Structure, Liquidity, and Learning Roadmap

**Updated:** 2026-11-10  
**Scope:** BTC and ETH first; Coinbase live data; paper trading only; no real-money execution.

## Product direction

Open Charting is a candle-first learning and paper-trading terminal. Deterministic chart engines should calculate structure, liquidity, candle patterns, and market phases. AI should explain those findings in plain language rather than inventing chart points or over-labeling every candle.

The chart must remain readable. Every major visual feature is optional and independently switchable.

## Agreed visual layers

### AI — Major Structure and Liquidity

The clean AI layer is the primary educational view. It should show only:

- Confirmed major swing highs and swing lows.
- HH, HL, LH, and LL labels for major pivots only.
- A restrained neon path connecting alternating major pivots.
- Buy-side liquidity above meaningful highs.
- Sell-side liquidity below meaningful lows.
- Equal or near-equal highs and lows where appropriate.
- Liquidity sweeps and sweep-and-reclaim events.
- Explanations in the AI side panel.

The AI layer should not show the full set of FVG, iFVG, order-block, or minor-event annotations by default.

Initial structure rules to test:

- Swing strength: 5 candles left and right.
- Major movement threshold: approximately 1.25 x ATR.
- Exclude the still-forming candle from confirmed structure.
- Consolidate consecutive same-side pivots to the more extreme pivot.
- Connect only alternating major highs and lows.
- Do not draw minor internal zigzags.

These values are initial test parameters, not trading guarantees. They must be validated on BTC and ETH across the selected timeframes.

### ICT Structure 1 — Full ICT

Optional detailed layer containing the existing broader ICT information:

- BOS
- CHoCH
- FVG
- iFVG
- Other existing ICT events and zones

This should remain off by default when a clean chart is preferred.

### ICT Structure 2 — BOS / CHoCH

A cleaner structural-event layer containing:

- Confirmed BOS
- Confirmed CHoCH
- No FVG
- No iFVG

### ICT Structure 3 — Trendlines

A separate trendline and diagonal-structure layer containing:

- Rising support trendlines.
- Falling resistance trendlines.
- Major swing anchors only.
- Trendline breaks.
- Optional retest guides.

A trendline should require at least two meaningful filtered anchor points. It should not connect every minor pivot.

### ICT Structure 4 — Candle Patterns

An independent candle-pattern layer containing colour-coded candle recognition. It must work with or without AI enabled.

Initial patterns:

- Hammer / rejection candidate.
- Shooting star / rejection candidate.
- Bullish engulfing confirmation.
- Bearish engulfing confirmation.

Future pattern registry:

- Doji.
- Pin bar.
- Morning star.
- Evening star.
- Inside bar.
- Outside bar.
- Other user-approved patterns.

Each pattern should have a name, colour, explanation, and—where applicable—confirmation rules. Candle colours are educational markers, not automatic trade signals.

### ICT Structure 5 — Macro and Entry Confirmation

Future selectable strategy layer containing:

- Asian, London, and New York session context.
- New York macro windows.
- Stop-hunt context.
- IFVG setups.
- Breaker setups.
- First and second entry confirmations.
- Candle-close confirmation rules.
- Entry, stop-loss, and take-profit planning.

This layer should be session-aware but should not assume that London always reverses Asia or that New York always confirms London.

### ICT Structure 6 — Market-Cycle Patterns

Future market-phase layer containing cautious, evidence-based labels for:

- Possible accumulation.
- Confirmed accumulation structure.
- Possible distribution.
- Confirmed distribution structure.
- Reaccumulation.
- Redistribution.
- Double tops and double bottoms.
- Breakouts and breakdowns.
- Retests.
- Trend continuation.
- Possible trend reversal.
- Range high and range low.

The layer should label phases as possible or confirmed based on evidence. A sideways range alone must not be called accumulation or distribution.

## Liquidity education model

Liquidity should be visible and colour-coded in the AI structure layer.

### Liquidity colours

- **Gold / amber:** buy-side liquidity (BSL), generally above meaningful highs.
- **Cyan / blue:** sell-side liquidity (SSL), generally below meaningful lows.
- **Orange or red marker:** a liquidity sweep.
- **Green marker:** sweep followed by a reclaim or confirmation.

Colours must be paired with text labels for accessibility and learning:

- `BSL` / `Buy-side liquidity`
- `SSL` / `Sell-side liquidity`
- `BSL swept`
- `SSL swept`
- `BSL sweep + reclaim`
- `SSL sweep + reclaim`

Liquidity should be represented by restrained horizontal lines or zones, not a large number of competing lines. Candidate liquidity can be lighter and more transparent; swept liquidity can become visually stronger and then expire or remain historical according to the selected display setting.

### Liquidity definitions

- Buy-side liquidity may be associated with meaningful highs, equal highs, double tops, range highs, or session highs.
- Sell-side liquidity may be associated with meaningful lows, equal lows, double bottoms, range lows, or session lows.
- A sweep occurs when price trades through a level and then closes back on the expected side of it.
- A sweep is not automatically a trade signal. Structure confirmation is required.

## Accumulation and distribution model

Accumulation and distribution should be treated as multi-candle market phases, not single-candle patterns.

### Possible accumulation

Evidence may include:

1. A preceding decline.
2. A sideways range.
3. Lower lows stop forming.
4. Sell-side liquidity is swept.
5. Price reclaims the range.
6. Price later breaks the range high or the most recent lower high.
7. A breakout retest holds.

### Possible distribution

Evidence may include:

1. A preceding advance.
2. A sideways range.
3. Higher highs stop forming.
4. Buy-side liquidity is swept.
5. Price returns inside the range.
6. Price later breaks the range low or the most recent higher low.
7. A breakdown retest fails.

The engine should expose evidence and confidence, for example:

- `Ordinary consolidation`
- `Possible accumulation — 6/10`
- `Possible distribution — 5/10`
- `Accumulation structure confirmed`
- `Distribution structure confirmed`

The AI should explain which evidence is present and what confirmation is still missing.

## Session-aware context

Use UTC internally and display the active session timezone clearly. New York-based windows must account for daylight-saving changes.

The session engine should track:

- Asian high, low, midpoint, and range size.
- London sweep or breakout of the Asian range.
- New York confirmation, reversal, retest, or lack of follow-through.
- Session volatility and timeframe.

Session timing is context, not proof. The system must record what happened rather than claim that a session always manipulates or reverses another session.

## AI responsibilities

AI should:

- Explain deterministic chart findings.
- Identify what evidence supports or weakens a setup.
- Distinguish candidate, confirmed, invalidated, and expired states.
- Explain liquidity in beginner-friendly language.
- Keep BTC and ETH chart context separate.
- Respect the active symbol, timeframe, and visible layers.
- Avoid presenting educational annotations as guaranteed signals.

AI should not:

- Invent swing points disconnected from candle data.
- Call every range accumulation or distribution.
- Treat every liquidity sweep as a buy or sell signal.
- Automatically place real trades.
- Replace deterministic pattern calculations.

## Recommended implementation order

### Milestone 1 — Clean AI structure

1. Restore the neon path.
2. Increase initial swing strength from 2 to 5.
3. Increase the major movement filter from 0.75 x ATR to approximately 1.25 x ATR.
4. Keep only alternating major pivots in the neon path.
5. Suppress minor HH/HL/LH/LL labels from the AI visual layer.
6. Add tests for noisy pivot rejection and major path selection.

### Milestone 2 — Liquidity layer

1. Detect meaningful highs and lows eligible to hold liquidity.
2. Detect equal and near-equal highs and lows.
3. Render BSL and SSL with the agreed colours.
4. Detect sweep and sweep-and-reclaim events.
5. Add a small legend and AI explanations.
6. Add tests for untouched, swept, reclaimed, and invalidated liquidity.

### Milestone 3 — ICT Structure 3

1. Add filtered trendline anchors.
2. Render rising support and falling resistance.
3. Detect break and retest states.
4. Keep trendlines independent of the AI neon path.

### Milestone 4 — ICT Structure 4

1. Rename the standalone candle-colour layer to ICT Structure 4.
2. Preserve current hammer, shooting-star, and engulfing detection.
3. Add the user’s candle list through a pattern registry.
4. Add one pattern at a time with tests and chart examples.

### Milestone 5 — ICT Structure 6

1. Detect range boundaries.
2. Detect preceding trend context.
3. Detect accumulation and distribution candidates.
4. Score evidence without claiming certainty.
5. Confirm only after breakout, breakdown, reclaim, or retest evidence.
6. Add double-top and double-bottom detection.
7. Add breakout, retest, reversal, and continuation states.

### Milestone 6 — ICT Structure 5

1. Add configurable session windows.
2. Add Asian range tracking.
3. Add London and New York reactions.
4. Add macro windows.
5. Add IFVG, breaker, and entry-confirmation rules.
6. Backtest observations on BTC and ETH before using the layer for paper setups.

### Milestone 7 — Paper-trading education loop

Only after the chart engines are stable:

- $500 paper balance.
- Protected reserve.
- $10 normal position size.
- $25 maximum position size.
- Stop-loss and take-profit rules.
- Manual Take / Skip review.
- Trade journal.
- Reset button.
- No real-money execution.

## Current project status

Already present or partially present:

- Coinbase/live-data development path.
- AI chart context and left-side AI drawer.
- AI swing detection and major-pivot metadata.
- ICT Structure 1 and Structure 2 separation.
- Candle-pattern engine for hammer, shooting star, and engulfing.
- Standalone candle-pattern colour toggle.
- AI neon connector was temporarily removed for visibility; the next milestone restores it in a cleaner major-structure form.
- Candle countdown and chart toolbar improvements.

The next code change should be **Milestone 1 only**. Do not begin trendlines, session logic, accumulation/distribution, or paper trading in the same change.
