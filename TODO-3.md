# open-charting — agreed requirements and next steps

**Updated:** 2026-11-25  
**Purpose:** Current planning tracker. This version consolidates the older `TODO-1.md` and `TODO-2.md` drafts from the `project-archive` branch, the current root `TODO.md`, and later decisions confirmed in conversation. Keep older files as historical records; use this file as the current planning version.

Status labels:
- **Agreed** — a decision confirmed by the user.
- **Current / verify** — described by the user or existing notes, but check the code before changing it or claiming it is complete.
- **Draft** — a sensible first proposal, not a settled rule.
- **Parked** — not the next implementation task.

## Product direction and safety

- Keep the existing main candlestick chart experience. New analysis belongs in independent, optional layers.
- For now, this is for learning and simulated trading only. There is no real-money execution, order routing, or automatic order placement. The user may consider changing this in the future; that possibility does not authorize implementation of real-money features. Any such change requires a separate explicit decision and safety review.
- In new wording use **trade candidate**, not “buy” or “sell” instructions. Avoid “paper” in new labels and wording. Preserve existing text on locked layers unless explicitly asked to change it.
- Keep charts visual, clear, and readable. Use sparse, meaningful labels; avoid collisions and dense overlays.
- Use the project name **open-charting** only.
- Do not treat a task as complete until its tests pass and the user-requested chart appearance checks are done.

## Rules that apply to every layer

- Each layer has its own toggle, state, settings keys, labels, markers, colours, rules, and lookback. Turning one layer on must not turn on another or borrow its visible output or decision logic.
- A layer can use a shared calculation (for example, a swing-point calculation) without enabling another layer’s display. A true clone must have independent state; later edits to one clone must not silently change the other.
- Keep saved drawing data intact.
- Current visibility windows recorded in the project: ICT marks, connectors, zones, and automatic zigzag are visible over the latest **3 days**; manually drawn trendlines over **7 days**. These are visibility filters, not deletions. Keep these as defaults unless a layer has a separately agreed lookback. Do not force every layer to use the same lookback.
- For each layer, test it alone and in intended combinations. Check for hidden cross-activation, label collisions, and correct on/off behavior. Add focused regression tests. Do not mark complete before chart checks.
- For substantial changes, inspect first and report what exists. Do not ask one question at a time. Group any genuinely unresolved decisions into one short list, give recommended defaults, and wait for approval before changing code.

## Layer status at a glance

| Layer | Current menu name / role | Status |
|---|---|---|
| ICT 1 | Market Structure | **Locked**; preserve exactly what it shows today. |
| ICT 2 | Liquidity / Sweeps | **Locked for now**; future work parked; verify one known cross-activation bug. |
| ICT 3 | Candle Patterns currently; intended Supply and Demand | **Next to build**; clone ICT 6 independently, strip ICT 6-specific features, then build the new layer. |
| ICT 4 | ICT Trade Setup | **Parked**; future Tori Trades-style trendline study. |
| ICT 5 | ICT AI Setup (menu); swing points in the plan | Improve useful swing-point display for future ICT 4; old AI route is parked. |
| ICT 6 | Candle Characters & Names | In progress; its own chart checks remain. Other-layer work must not alter it. |
| ICT 7 | Not currently in the menu | Future cross-market/multi-timeframe study; needs a two-chart layout and ICT 3 context. |

Menu names above are from the existing menu/screenshot information. Confirm names against code when working in the files; do not rename a layer without approval.

## ICT 1 — Market Structure (locked)

- **Agreed:** ICT 1 continues to show exactly what it shows today. “Shows everything” means its existing current display; do not expand it as ICT 4 or ICT 5 are built.
- No work on ICT 2, 3, 4, 5, 6, 7, or the scanner may alter ICT 1.
- If an implementation would affect ICT 1, stop and explain why before changing it.

## ICT 2 — Liquidity / Sweeps (locked for now)

- Keep its current behavior; future enhancements below are parked, not cancelled.
- **Bug check:** ICT 2 alone has previously appeared to turn on ICT 4 colour dots, triangles, tags, and the bottom colour menu. Verify whether this still occurs. If so, record and fix it as an independence bug without changing ICT 1 or unrelated ICT 4 behavior.
- Parked future rules from the older TODO: qualify a sweep only when no earlier candle closed through the level and it is the highest high / lowest low of the previous 30 candles; draw BOS/CHoCH only when a qualifying sweep set it up; show sweep → BOS/CHoCH → retest → hold → trade; use a one-month lookback; verify alone on 5m, 15m, and 1h with screenshots.
- Do not implement this future list as part of ICT 3 or ICT 7.

## ICT 3 — Supply and Demand (next implementation)

### Agreed purpose and build approach

- ICT 3 is changing from the current **Candle Patterns** layer into an independent **Supply and Demand** layer.
- **Agreed:** use ICT 6 as a starting code/presentation structure by making a true independent copy, then strip ICT 6-specific content from the ICT 3 copy. Do not build ICT 3 by sharing mutable state or rules with ICT 6.
- Before edits, inspect and report what ICT 3 and ICT 6 currently do, the relevant dependencies, and the tests covering ICT 6. This is a report-only check; no edits during that first inspection.
- Back up the Mac project copy and verify the backup is pushed before implementation. The public GitHub repository currently has a `project-archive` branch; verify it contains the intended backup commit/content before treating the backup step as complete.
- Only after the backup is verified, work on a fresh `ict-3-supply-demand` branch based on the saved project state. Do not implement ICT 3 on the ICT 6 working branch.

### Strip from the ICT 3 copy

Remove from the ICT 3 copy only:
- ICT 6 character names;
- the existing ICT 3 candle-body recolouring (reported colours: lime, pink, light blue);
- ICT 3’s **Candle Patterns** menu key/legend;
- ICT 6-style Retest / Hold / Trade steps and their decision logic.

Do not remove these features from ICT 6. Retain generic chart plumbing such as zoom handling and collision prevention if it is still useful and does not preserve unwanted ICT 6 decisions or labels. Keep BOS/CHoCH only if the ICT 3 break rule needs it. ICT 3 gets its own zone colours, labels, settings, and logic.

The existing **ICT Trade Setup** key belongs to ICT 4, not ICT 3. Do not delete it as part of stripping ICT 3. If ICT 3 alone makes the ICT 4 key appear, treat that as cross-activation and fix the ownership/visibility.

### Intended sequence (agreed)

**Zone → break → retest → trigger → trade candidate.**

This supersedes the older wording that put a trigger candle before the retest. Keep “confirmation” and “trade candidate” distinct only if the final rules need two separate steps; the current intended sequence ends in one trade-candidate step.

### Draft version-one rules (not yet approved as final strategy rules)

Use these as the initial concrete proposal so the work can move forward. Present them together for one review before coding; do not ask about each item separately or quietly claim they were already approved.

- **Automatic or manual:** automatic zones first; manual zones can be considered later.
- **Demand zone:** last down candle before a strong upward move that closes through a recent swing high. **Supply zone:** mirror image, last up candle before a strong downward move that closes through a recent swing low.
- **Zone boundaries:** full high-to-low range of that one candle.
- **Visibility/lookback:** start with the current 3-day ICT visibility window; keep it as one layer-specific adjustable setting. Check whether this is too short for the selected timeframe before calling it complete.
- **Break:** price moves away from the zone and closes through the relevant recent swing point; that break validates the zone for this setup.
- **Retest:** after the break, price returns into the zone.
- **Trigger:** a candle in the zone rejects it, tentatively a close back out of the zone or a qualifying long wick. Define the wick threshold during the single rule review; do not guess it in implementation.
- **Trade candidate:** the next candle closes beyond the trigger candle’s high for demand or low for supply. Display as a candidate, not an instruction or order.
- **Zone used up / invalidation:** tentatively invalidate after a candle body closes through the far edge, or after one trade candidate has fired. Confirm whether either condition should instead be configurable.
- **Visuals:** translucent supply/demand rectangles extending right until invalidated/used, red-toned supply and green-toned demand, small readable zone labels, and step labels only for the active setup. Do not reuse ICT 6’s Trade ▲/▼ colours or labels.

### ICT 3 completion checks

- Test ICT 3 alone, ICT 6 alone, and ICT 3 + ICT 6 together.
- Confirm that ICT 3’s old recolouring and Candle Patterns key are gone only when appropriate, and ICT 6’s names, colours, keys, Retest/Hold/Trade logic, and visuals remain unchanged.
- Test valid and invalid zones, break, retest, trigger, candidate, zone invalidation, lookback, zoom, and label collision cases.
- Verify visually on the chart before marking complete.

## ICT 4 — ICT Trade Setup (parked)

- Current menu name: **ICT Trade Setup**. Verify the exact implementation and key ownership when this layer is next worked on.
- Future idea: a Tori Trades-style trendline study using swing points from ICT 5 as anchors, to learn trends and possible break/retest behavior.
- ICT 4 must not switch on ICT 5 or show ICT 5 labels just to access swing calculations. Use a shared point-finding function or equivalent independent calculation.
- Its current key/markers have existing meaning (Liquidity, Sweep confirmed, BOS, CHoCH, Retest/candidate, Invalidated). Decide later whether to remove, move, or adapt them; do not silently repurpose them now.
- Give ICT 4 its own lookback. The general 3-day window may be too short for trendlines; manually drawn trendlines currently use a 7-day window.

## ICT 5 — ICT AI Setup menu / swing points in the plan

- Current menu name shown: **ICT AI Setup**. The working direction discussed is improving the visibility and usefulness of swing points (HH, HL, LH, LL) for possible ICT 4 trendline anchors. Verify current code before changing or renaming it.
- Show meaningful, sparse swing points rather than labeling every candle. The user has said the current yellow/neon HH/HL/LH/LL points are too limited to show enough structure.
- ICT 4 may use the same swing-point calculation without enabling the ICT 5 display.
- The older idea of an AI-generated possible swing route toward a sweep is parked; do not make AI route prediction the next ICT 5 task.
- Exact qualifying points, count, and display density are future design choices; no change is authorized as part of ICT 3.

## ICT 6 — Candle Characters & Names (protect while other layers are built)

- Preserve ICT 6’s current patterns, candle names, colours, keys, BOS/CHoCH, attached Retest/Hold/Trade behavior, signals, and layout while implementing ICT 3 or ICT 7.
- Its own open chart checks remain; “protect it from other-layer work” does not mean declaring ICT 6 complete.
- Existing implementation notes: BOS/CHoCH, attached Retest/Hold/Trade labels, sprite-only zoom suppression, and cross-tag collision avoidance have been implemented. Bullish Trade is green (`Trade ▲`) and bearish Trade is red (`Trade ▼`); Retest and Hold retain their existing colours. Regression tests cover label spacing, zoom visibility, and tag placement. Typecheck, lint, tests, and production build passed at the time recorded below. Actual chart appearance checks remain open.
- Continue checking candle-name visibility (including Hammer and Hanging Man), BOS/CHoCH lines, step-label placement, and zoom behavior. Pattern names are primarily shape-based; do not change their context rules without a separate decision.
- ICT 7 may show candle names/structure for context, but must not use ICT 6’s Hold or Trade decisions. ICT 3 must be a separate copy with those steps removed from its copy.

## Scanner — separate workstream; do not merge by assumption

- The user reports the scanner was set up in a different terminal. Its source location and exact relationship to ICT 6 are not established by these TODO files.
- GitHub currently has a branch named `scanner`, but an inspection of its tree did not show an obvious path containing “scanner” or “scan”. This does not prove the scanner is absent; it may be named differently or kept outside this repository.
- Do not change, merge, delete, or wire the scanner into ICT 6/ICT 1 as part of ICT 3 or ICT 7 work.
- When the scanner is next reviewed, first locate its actual folder/repository/branch and report what it does. Then assess possible overlap with ICT 6 and agree ownership. No scanner decision may alter locked ICT 1.

## Chart engine evaluation — TradeCanvas (optional, separate prototype)

- The user is considering TradeCanvas because it provides a chart interface, built-in indicators, custom overlay/indicator extensions, and a two-pane grid. Its documentation describes an MIT licence; check the current licence and APIs before using it.
- This is an evaluation only, not an approved replacement or migration. Keep the existing open-charting project and its GitHub/Mac copies untouched.
- If explored, create a separate prototype/project. First verify the chart, the same market-data feed, and the user’s preferred zoom/scroll feel. Then build a two-pane layout and adapt one uncomplicated ICT visual layer as a proof of concept.
- Existing ICT rules and decisions can be reused, but chart-engine code may need adaptation because the current project uses Lightweight Charts. Do not assume layers can be copied directly or that the port will be small.
- Compare both projects using the same symbol, timeframe, feed, chart size, visible-bar range, and overlays. Do not attribute differences to rendering speed unless those conditions are comparable.
- TradeCanvas’s built-in indicators do not provide market data. MES/MNQ availability still depends on a suitable data source. Do not change or replace the current project unless the user explicitly chooses that after seeing the prototype.

## ICT 7 — Cross-market / multi-timeframe learning study (after ICT 3 and two-pane layout)

### Purpose and dependencies

- ICT 7 is a separate, optional study inspired by the multi-market, multi-timeframe method described in Hannah Chan’s videos. This is a learning experiment, not a proven or guaranteed strategy.
- **Dependency:** ICT 7’s intended higher-timeframe point-of-interest context includes supply/demand zones. Build ICT 3 first; ICT 7 must not pretend that its supply/demand context exists before ICT 3 is available.
- The current app does not yet provide the two-chart split screen needed to compare markets. Add a basic two-pane layout before implementing ICT 7’s cross-market confirmation logic.
- First intended market pair: **MES** (Micro E-mini S&P 500) and **MNQ** (Micro E-mini Nasdaq-100); each should be changeable. The currently documented Coinbase adapter supports six crypto pairs, not these futures, so a compatible data source is needed. Do not silently substitute crypto or promise MES/MNQ data until a source is confirmed.
- A clone may be used as a UI reference for pane layout, but do not replace the chart engine or copy code without checking its licence.

### Two-chart layout requirements

- First version: two charts, not four.
- Each pane has its own market, timeframe, visible layers/indicators, and chart view; drawings are pane-specific where supported.
- Cross-pane syncing is optional, never forced.
- Preserve current single-chart behavior.
- Confirm available data/timeframes before promising a specific market or interval. The documented Coinbase source has 1m, 5m, 15m, 1h, 6h, and 1d candles; other intervals are locally aggregated. A 3m interval would require aggregation from 1m data and verification. Futures require a separate data source.

### ICT 7 draft study sequence

1. **Higher-timeframe context:** primarily inspect 1h swing points, ICT 3 supply/demand areas, and fair value gaps. 4h/daily may be optional context in version one.
2. **Wait for a point of interest:** if price has not reached the area, show WAITING; do not invent a setup.
3. **1m setup evidence:** look for a candle-body close through the relevant swing level as possible market-structure-shift evidence, with a same-direction fair value gap as supporting evidence.
4. **Other-market check:** show whether corresponding evidence is present, missing, or conflicting on the other pane. Do not require equal price levels or identical candle shapes across markets.
5. **3m/5m review:** allow supporting or conflicting candle/structure evidence. Check/aggregate the timeframes; do not make a particular pattern mandatory until the rule is agreed.
6. **Explain the result:** always show which conditions were found and which are missing or opposed.

### ICT 7 patterns, visuals, and boundaries

- **Agreed:** ICT 7 has its own patterns, state, rules, labels, outputs, and toggle. It must not inherit ICT 6’s Hold or Trade logic, and ICT 7 work must not alter ICT 1–6.
- It may use ICT 6’s general visual style or display candle names/structure as context. If using ICT 6 code structure as a starting point, make an independent copy, then remove ICT 6-specific Hold/Trade decisions and create ICT 7’s own pattern set. Never share mutable state or silently change ICT 6.
- No BUY/SELL labels or trading instructions. No order submission, routing, or automation.
- Suggested states, with evidence shown: **WAITING**, **SETUP FORMING**, **CONFIRMED**, **CONFLICTING**. “Confirmed” means only that the agreed conditions were observed; it does not mean a trade is safe or likely to win.
- Record examples that meet the conditions and examples that fail them.

## AI coach / screen layout (separate from ICT 7)

- AI analysis remains independently switchable and must not replace or modify the main chart.
- Existing planning idea: show candidate swing points and a discussion panel beneath the chart, with text and speech controls. Keep the chart and conversation usable together, with a vertically scrollable chart/panel column, readable text, adjustable space, and expand/restore control.
- AI-generated swing ideas must be described as uncertain, not confirmed predictions. Confirmed pivots can be explained from candle data.
- External-provider chat requires the user’s own API key; never ask the user to paste a secret into chat. A keyless, rules-based Chart Coach was proposed but has not been approved.
- Do not expand this AI work while implementing ICT 3 unless explicitly requested.

## Market data and local workflow (existing notes)

- Keep the local workflow simple; the development server uses port 5173. Provider setup is optional.
- The Coinbase live adapter is opt-in (`VITE_ADAPTER=coinbase npm run dev`) and uses public read-only market data without an API key. Do not replace the default demo feed unless asked.
- Project notes record six Coinbase crypto pairs: BTC-USD, ETH-USD, SOL-USD, BNB-USD, XRP-USD, and ADA-USD. Verify current adapters before depending on a particular pair or timeframe.
- Coinbase data is not an order execution route. Simulated trading only.

## Backup and branch workflow

- GitHub currently lists `project-archive`, `character-candles`, and `scanner` branches. The `project-archive` branch contains archived material and TODO drafts. A remote branch’s existence is not, by itself, proof that the latest Mac files are safely backed up.
- Before ICT 3 edits: verify the Mac project copy and intended recovered files are represented in a committed backup; push and verify the backup commit. Do not overwrite active project source with the recovered copy.
- Only after backup push succeeds, create/switch to `ict-3-supply-demand` from the saved work. Do not implement ICT 3 on `character-candles`, and do not edit ICT 6.
- Do not delete the Mac/recovered copy. Do not use destructive Git commands or force-push.
- At the end of the setup, report briefly: branch, what was preserved, TODO source chosen, commit hashes, push status, skipped files/secrets/large generated folders, and items found only in the recovered copy.

## Work order

1. Verify the backup content and push; then create `ict-3-supply-demand`.
2. Report-only code inspection of ICT 3, ICT 6, their dependencies, existing keys, and relevant tests. No edits yet.
3. Present the ICT 3 draft zone/trigger rules together in one concise review. Once approved, clone ICT 6 independently into ICT 3, strip the ICT 6-specific pieces listed above, and build ICT 3’s Supply and Demand behavior.
4. Test and visually review ICT 3 alone, ICT 6 alone, and together. Verify ICT 1 and unrelated layers are unaffected.
5. After ICT 3, evaluate the two-pane/chart-engine options. If the user chooses to test TradeCanvas, do so in a separate prototype and compare it fairly; otherwise build and test a basic two-pane layout in open-charting while preserving the one-chart layout. Confirm data-source feasibility for MES/MNQ and interval support.
6. Once the chosen layout and ICT 3 dependency work, define/implement ICT 7’s own cross-market study rules. Do not use ICT 6 Hold/Trade; do not add BUY/SELL instructions.
7. Later/parked work: ICT 6 chart appearance checks; ICT 5 swing-point design; ICT 2 future sweep rules; ICT 4 trendlines; scanner discovery/review; AI coach. Do not silently pull these into ICT 3/7 scope.
8. For each implementation, run the focused tests, full available tests, typecheck, lint, and production build. Report actual results and chart checks; do not claim checks passed unless run.

## Recorded implementation history (from earlier TODO versions; verify before relying on it)

- `b01cb6a`: ICT shows only latest confirmed high/low labels in view while retaining a neon zigzag; AI structure also has an alternating neon zigzag; AI panel scrolling and expand/restore adjustments. Historical notes report typecheck, lint, 211 frontend tests, 12 backend tests, and build passed.
- `d682d4e`: opt-in Coinbase REST/WebSocket market data; six crypto pairs; 30m/4h/weekly aggregation. Historical notes report read-only conformance checks, tests, lint, typecheck, and build passed.
- `24e3912`: ICT marks/connectors/zones/automatic zigzag limited to three days before latest candle; manual trendlines use seven days; saved drawings unchanged. Historical notes report checks passed.
- ICT 6 notes: BOS/CHoCH and attached Retest/Hold/Trade; bullish Trade green and bearish Trade red; regression coverage for label spacing, zoom visibility, and tag placement. Actual chart checks remain open.
- These are historical claims copied from previous TODOs, not tests rerun while creating this document.
