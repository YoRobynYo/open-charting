# ICT Scanner Indicator

## Purpose

This branch contains the first planned ICT Scanner indicator for `open-charting`. It identifies configured candlestick formations and closed-candle BOS/CHoCH breakout points so they can be assessed alongside the chart's other indicators.

This document is the handoff point for any AI or developer continuing the work. Read it before changing scanner rules, scope, definitions, or account behavior.

## Branch and baseline

- Branch: `scanner`
- Baseline commit: `be5458b` — `feat: refine learning trade setup display`
- The later commit `0c8ae93` (`fix: stabilize toolbar timer and timeframe layout`) is intentionally not included in this branch because it is unrelated UI work.
- The first milestone is deliberately limited to pattern formations plus BOS/CHoCH breakout context.
- Existing swing-point and liquidity/sweep overlays remain separate indicators. Do not duplicate or move them into this indicator.
- Paper-ledger and terminal-scanner work can follow after the chart indicator is understandable and tested.

## Hard rules

1. **Paper trading only.** No real orders, no real funds, and no live trading API keys.
2. **Initial market scope: BTC and ETH only.** Use Coinbase symbols available to the data adapter, normally `BTC-USD` and `ETH-USD`.
3. **Candle-first analysis.** Signals start with candle structure and price action. Indicators may provide context, but they do not override the candle rules.
4. **No automatic copying.** A BTC decision must never be copied automatically to ETH, or vice versa.
5. **Patterns are signals, not conclusions.** Each setup is different and must be calculated from its candle signal, location, structure, volatility, levels, and other available context.
6. **Keep live scanning separate from backtesting.** A backtest must use a separate throwaway paper account and must not alter the live paper ledger.
7. **Keep indicators modular.** A detected pattern, swing point, liquidity event, BOS, or CHoCH is evidence to assess alongside the other chart tools.
8. **Ask before changing scope or definitions.** Do not silently change markets, timeframes, pattern definitions, or order behavior.

## Working definitions

- **HH (higher high):** a confirmed swing high above the previous confirmed swing high.
- **HL (higher low):** a confirmed swing low above the previous confirmed swing low.
- **LH (lower high):** a confirmed swing high below the previous confirmed swing high.
- **LL (lower low):** a confirmed swing low below the previous confirmed swing low.
- **BOS (break of structure):** a closed candle breaks beyond the relevant last confirmed swing point in the direction of the current structure, supporting continuation.
- **CHoCH (change of character):** a closed candle breaks beyond the relevant last confirmed swing point against the current structure, indicating a possible reversal rather than a confirmed trade.
- **Swing high/low:** use only confirmed pivots with the configured number of candles on both sides; a forming candle cannot confirm a swing.
- **Break:** use the candle close beyond the swing level, not an intr candle wick alone, unless a future rule explicitly documents otherwise.
- **Forming candle:** the current incomplete candle is excluded from setup confirmation and backtest decisions.

If the exact pivot width or timeframe is changed, update this document and the tests together.

## First ICT Scanner scope

The first indicator builds on the existing `src/lib/candle-patterns.ts` without changing its core detector. It should recognize and label these formations:

- Hammer
- Inverted hammer
- Shooting star
- Hanging man
- Bullish engulfing
- Bearish engulfing
- Morning star
- Evening star
- Bullish marubozu
- Bearish marubozu

The indicator must also identify closed-candle:

- **BOS:** a close beyond the relevant swing level in the direction of the current structure.
- **CHoCH:** a close beyond the relevant swing level against the current structure.

The existing swing-point indicator remains responsible for drawing and teaching swing points. The ICT Scanner may consume the shared candle/structure information needed to locate a breakout, but it must not create a second competing swing or liquidity system.

The existing liquidity/sweep indicator remains separate and is not a required input for the first milestone. Liquidity can be learned and integrated later without making the initial indicator too busy.

Every result should distinguish at least:

1. **Pattern detected:** the formation exists in completed candles.
2. **Breakout context:** BOS, CHoCH, or no qualifying breakout detected.
3. **Trade-point candidate:** optional classification based on the currently enabled rules and the user's calculation of the individual setup.

The current forming candle is excluded from confirmation. A pattern may be visible as developing, but it cannot be marked confirmed until the relevant candle or candle sequence has closed.

The indicator should support independent on/off controls for the pattern groups and BOS/CHoCH display. Turning a filter off must not erase raw pattern evidence; it only changes which evidence is used for a candidate classification.

Demand/supply zones, volatility filters, liquidity, FVGs, order blocks, and risk/reward qualification are later layers unless explicitly added to this milestone.

## Planned paper account rules

The paper ledger is planned to use:

- Starting balance: `$500`
- Nominal amount per trade: `$25`
- Protected reserve: `$100`
- Maximum open trades: `4`
- Maximum one open trade per coin
- Simulated fees and slippage
- If one candle touches both stop and target, assume the stop was hit first

These are the project's paper-ledger simulation rules. They are separate from the chart's pattern and structure evidence.

## Later scanner and paper-ledger work

The previous chat described these files for a later command-line scanner and paper-ledger milestone. They are not required for the first ICT Scanner indicator and still need to be transferred into this repository, verified, and committed; their names are part of the plan, not proof that they currently exist:

- `scripts/scanner-setup.ts` or the agreed scanner setup module
- `scripts/paper-ledger.ts`
- `scripts/scan.ts`
- `scripts/ledger-store.ts`
- `scripts/scanner-setup.test.ts`
- `scripts/paper-ledger.test.ts`
- `SETUP.md`
- `scanner-data/` as local runtime state, excluded from Git

The intended terminal commands are:

```text
npm run scan
npm run take
npm run status
npm run monitor
npm run close
npm run reset
npm run auto
```

The exact command wiring must match the repository's existing package and test conventions before it is committed. The `auto` command must be opt-in and must not place real orders.

## Data and safety behavior

- Use public Coinbase data with no keys for the initial implementation.
- Skip unsupported or unavailable symbols with a clear per-symbol message.
- One unavailable market must not stop the entire scan.
- Record symbol, timeframe, candle timestamp, rule version, setup state, evidence, and rejection reason where applicable.
- Warn when data is stale or incomplete.
- Keep account history under `scanner-data/` out of the public repository.
- Do not commit personal balances, runtime ledger files, credentials, or generated account history.

## Staged workflow

### Stage 1 — Data foundation

Fetch and validate candle data. Drop the forming candle. Normalize timestamps and reject malformed or stale data.

### Stage 2 — Pattern and breakout indicator

Reuse the existing candle-pattern logic. Add the missing formation detectors and closed-candle BOS/CHoCH labels. Keep swing-point and liquidity visualization in their existing indicators.

### Stage 3 — Setup qualification

Evaluate whether a detected pattern plus breakout context should be shown as an educational trade-point candidate. Do not require liquidity, zones, volatility, or risk/reward in the first indicator milestone.

### Stage 4 — Paper ledger

Support scan, take, status, monitor, close, reset, and opt-in auto-monitor behavior. Enforce balance, reserve, position-count, per-coin, fee, slippage, and stop-first rules.

### Stage 5 — Honest backtesting

Run the same rule definitions over historical candles. At each candle, expose only candles available at that point; never peek into the future. Use a separate throwaway account with the same paper rules and report assumptions, trades, drawdown, fees, and outcomes.

### Later work

Liquidity integration, demand/supply zones, volatility filters, FVG/order-block context, risk/reward qualification, paper-ledger commands, broader watchlists, accumulation/distribution, and additional session logic are later milestones. Do not add them to the initial ICT Scanner unless the scope is explicitly changed.

## Current status

- Scanner branch created from `be5458b`.
- ICT Scanner handoff and rule document added.
- Existing candle-pattern, indicator, schema, Coinbase, structure, liquidity, and trade-setup foundations are present in the baseline.
- Initial implementation scope narrowed to formations plus BOS/CHoCH; swing and liquidity remain separate indicators.
- The scanner implementation files described in the previous chat are not yet present in this checkout.
- No live Coinbase test has been performed here.
- Historical backtesting is planned but not yet implemented.

## Definition of done for the first scanner milestone

Before calling the first milestone complete:

- The implementation files exist and are named/documented clearly.
- The forming candle is excluded.
- Unsupported symbols and stale data are handled without crashing the scan.
- Each configured formation and BOS/CHoCH behavior has unit coverage.
- Paper-ledger limits and stop-first behavior have unit coverage.
- Type checking and tests pass.
- A fake-data end-to-end run covers scan, take, duplicate-trade refusal, stop hit, and reset/archive.
- Runtime ledger data is ignored by Git.
- No real-order code or credentials are introduced.

At the end of every session, update this section and record the next concrete task. Do not claim a file or test exists until it has been verified in the repository.
