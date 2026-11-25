open-charting — agreed requirements and next steps

Rewritten 2026-11-25 from the old TODO named TODO-1.md, this new TODO will be updated to TODO-2.md.
The ICT 7 note, the ICT layer plan, and the layer-by-layer review. Items marked (agreed) were confirmed in conversation. Items marked (draft) or (open) are not decided. Do not treat planned items as finished until verified. Update this file as work is completed.


Agreed product direction
Keep the existing main candlestick/charting page intact. New analysis belongs in separate layers the user can switch on and off.
The goal is to learn chart and trading mechanics through practice, not to optimize for short-term profit.
There are no real trades in this build. No real-money execution and no automatic orders, anywhere.
Wording: say "trade candidate" in anything new. Avoid the word "paper" in new labels and text. (ICT 4's existing key still says "paper candidate"; ICT 4 is locked, so leave it.)
Keep the visual style clean, readable, and friendly; avoid dense overlays and tiny explanatory text.
Use the project name open-charting only.
Global rules for every ICT layer
Every ICT layer is independently switchable and composable. Enabling one must not silently enable another or mix its labels, markers, colours, keys, or logic into a different layer.
Each layer has its own state, toggle, settings keys, and label IDs. A "clone" must be a true copy, not shared code that another layer later depends on.
Each layer uses its own agreed lookback. Do not apply one layer's lookback to the others. Saved drawing data stays intact.
Avoid marking every candle. Show only sparse, meaningful labels and prevent annotation collisions.
For each layer: add or update focused tests, verify it works alone, then verify intended combinations with no hidden cross-activation. Do not mark a layer complete until the chart checks are done.
Current visibility windows (published): ICT marks, connectors, zones, and the automatic zigzag show only the last 3 days before the latest displayed candle; manual trendlines use 7 days. These only filter visibility.
Branches: character-candles is the active branch as of the old TODO; chart-backup-updates is a backup. Before the ICT 3 work, save the Mac copy to a backup branch and push it, then work on a fresh branch.


Layer status at a glance 
Layer	Menu name	Status

ICT 1	Market Structure	Locked (agreed). Full base layer that shows everything it shows today. Unchanged.
ICT 2	Liquidity / Sweeps	Locked for now (agreed). Sweep layer. Future work is parked below.
ICT 3	Candle Patterns → Supply and Demand	Next to build. See ICT 3.
ICT 4	ICT Trade Setup	Parked (agreed). Future Tori Trades-style trendline layer.
ICT 5	ICT AI Setup (menu) / swing points (plan)	Undecided. Needs design.
ICT 6	Candle Characters & Names	In progress. Do not change it while building ICT 3 or ICT 7.
ICT 7	Not in the menu yet	Future study. Needs the two-chart layout first.
ICT 1 — Market Structure
[x] Locked. Do not change. No other layer, including ICT 7, may alter it.
"Shows everything" means everything ICT 1 shows today. It does not grow when ICT 4 or ICT 5 are built unless explicitly requested.
ICT 2 — Liquidity / Sweeps (locked for now)
[x] Locked as it works today.
Bug to verify, even while locked: ICT 2 on its own has been observed to switch on ICT 4's colour dots, triangles, tags, and bottom colour menu. Check whether this still happens. If it does, log it as a cross-activation bug.
Future work (parked, not cancelled):
[ ] Count a sweep only when no earlier candle closed through the level and the sweep is the highest high or lowest low of the preceding 30 candles.
[ ] Draw BOS/CHoCH only when a qualifying sweep set it up.
[ ] Show the full sequence: sweep, BOS/CHoCH, retest, hold, trade.
[ ] Use a one-month lookback.
[ ] Verify ICT 2 alone on 5m, 15m, and 1h and save screenshots.
ICT 3 — Supply and Demand (next)

The idea changed during development. ICT 3 was a candle-pattern layer; it becomes the Supply and Demand layer.

Build order (agreed)
[ ] Back up the Mac copy and push it to GitHub on a backup branch.
[ ] Report only: Claude Code inspects the code and reports what ICT 3 and ICT 6 do, what they share, and which tests cover ICT 6. No edits.
[ ] Clone ICT 6 into ICT 3 as a true independent copy. Do not touch ICT 6 at all.
[ ] In the ICT 3 copy only, remove: the character names, the candle recolouring added earlier, the Candle Patterns key in the menu, and the Retest/Hold/Trade steps.
[ ] Build supply and demand on what is left, with its own zone colours.
[ ] Prove ICT 6 is unchanged: its existing regression tests (label spacing, zoom visibility, tag placement) pass untouched, and its behavior is the same before and after.
What is known from the chart (from screenshots; confirm in code)
ICT 3 on its own recolours some candle bodies (lime, pink, light blue) and shows no labels, lines, or zones. This is the colour system that cannot be used.
Both menu keys ("ICT Trade Setup Key" and "ICT Candle Patterns Key") appeared at the bottom of the menu with only ICT 3 on and ICT 6 off.
The Candle Patterns key belongs to ICT 3 and goes with the colours. The Trade Setup key belongs to ICT 4.
Draft rules (assumptions, not decided)

Sequence: zone → break → retest → trigger → trade candidate.

Item	Draft rule
Zone formation	Demand = last down candle before a strong up-move that closes through a recent swing high. Supply is the mirror image.
Boundaries	Full high-to-low range of that one candle.
Auto or manual	Automatic first. Manual zones later.
Lookback	3 days, matching the current ICT window, as one adjustable setting. Thin on 1h.
Zone used up	Invalid when a candle body closes through the far edge, or after one trade candidate has fired.
Break	The move away from the zone closes through the swing point. This validates the zone.
Retest	Price returns into the zone after the break.
Trigger	A candle in the zone that rejects it: a body close back out, or a long wick.
Trade candidate	The next candle closes beyond the trigger candle's high (demand) or low (supply). This is the only confirmation step.
Visuals	Translucent rectangles extending right until used up. Supply red-toned, demand green-toned, small "Supply"/"Demand" tag. Step labels only for the active zone. Do not reuse ICT 6's Trade ▲/▼ colours or labels.
Open decisions for ICT 3
[ ] Sequence conflict. The old TODO said: trigger candle in the zone, then retest, then confirmation. The ICT plan said: break, retest, trigger, trade candidate. The current intent is zone → break → retest → trigger → trade candidate. Confirm, and confirm that "confirmation" and "trade candidate" are the same step.
[ ] Confirm zone shape and edges, and automatic-only for the first version.
[ ] Confirm the lookback and when a zone is used up.
[ ] After stripping the clone, keep or remove BOS/CHoCH and the collision and zoom handling. Recommendation: keep the collision and zoom handling (plumbing); keep BOS/CHoCH only if the break step uses it.
[ ] Replace the existing Candle Patterns layer with the stripped clone only after the backup is taken and nothing else is found to depend on it.
[ ] Menu keys: ICT 3's Candle Patterns key is removed. For ICT 4's Trade Setup key, recommendation is to show it only while ICT 4 is on, not delete it. If ICT 3 alone is turning it on, log that as a cross-activation bug.
[ ] Agree and test the exact zone and confirmation rules before treating the layer as complete.
ICT 4 — ICT Trade Setup (parked)
[ ] Later. Intended future home for Tori Trades-style trendlines, to help learn trends, with break/retest behavior. Not yet defined.
Builds on ICT 5's swing points as anchors. Use a shared point-finding function so turning on ICT 4 never turns on ICT 5 or shows its labels.
Existing key (Liquidity, Sweep confirmed, BOS, CHoCH, Retest / candidate, Invalidated) and its markers need a decision before the new purpose is built: remove, move, or keep.
Needs its own lookback (the 3-day ICT window may be too short for trendlines; manual trendlines use 7 days). Decide on purpose.
ICT 5 — Swing points (undecided)
[ ] Improve the visibility and usefulness of HH/HL/LH/LL points so they can later anchor ICT 4's trendlines. It currently shows too few to make the structure clear.
[ ] Decide which points qualify and how many appear.
[ ] The menu calls ICT 5 "ICT AI Setup" while the plan calls it the swing-point layer. Resolve the naming and purpose.
Parked: the AI idea of visualizing a possible swing route toward a sweep. Not the main purpose now.
ICT 6 — Candle characters, names, and BOS/CHoCH (in progress)

Keep as is while ICT 3 and ICT 7 are built. Do not change its patterns, labels, colours, signals, or behavior from other layers' work.

[ ] Keep BOS/CHoCH visible together with the candle characters and pattern names.
[x] Each Retest/Hold/Trade step stays attached directly beneath its candle name, with a small gap.
[x] ICT 2's separate Sweep/Break/Hold/Trade action-word feature stays off in ICT 6.
[ ] Check candle-name visibility (including Hammer and Hanging Man), BOS/CHoCH lines, step-label placement, and zoom behavior in the chart. Record remaining limitations before marking complete.
[ ] Pattern names are currently shape-based and not validated against prior trend or location. Decide any context-sensitive naming separately before changing rules.

Implementation update (from the previous TODO): BOS/CHoCH, attached Retest/Hold/Trade labels, sprite-only zoom suppression, and cross-tag collision avoidance are implemented. Trade is green for bullish (Trade ▲) and red for bearish (Trade ▼); Retest and Hold keep their colours. Label spacing, zoom visibility policy, and tag placement have regression tests. Typecheck, lint, full tests (292 passed, 2 skipped, plus 12 server tests), and production build passed. Actual chart appearance checks are still open; do not mark ICT 6 complete until done.

ICT 7 — Cross-market confirmation / breakout study (future)

Inspired by the multi-market, multi-timeframe method Hannah Chan describes in her videos. A learning and testing tool, not a proven strategy. The exact rules must be validated against your screenshot of the split-screen setup and tested with practice examples.

Prerequisite: two-chart layout
[ ] Add a basic two-pane split-screen layout. Each pane has its own market, timeframe, visible ICT layers and indicators, and chart view (and drawings where supported).
[ ] Cross-pane syncing is optional, never forced.
[ ] Do not change current single-chart behavior. Start with two panes, not four.
[ ] First intended pair: MES and MNQ, with either market changeable.
[ ] Use another project only as a UI reference. Check any code licence before reusing code. Do not rewrite the chart engine or copy an entire clone.
Data gaps to resolve first
[ ] Data source. The project supports the demo feed and six Coinbase crypto pairs (BTC, ETH, SOL, BNB, XRP, ADA). MES and MNQ are futures, so a new source is needed, or test with a crypto pair first. Check what the project can supply before assuming MES/MNQ.
[ ] 3-minute candles. Coinbase gives 1m, 5m, 15m, 1h, 6h, 1d natively; 30m, 4h, and weekly are aggregated locally. A 3m chart needs new aggregation.
[ ] Lookback. The 3-day ICT window may be too short for the 1h context. Decide on purpose.
[ ] Supply/demand dependency. ICT 7's 1h context mentions supply/demand areas. Build after ICT 3, or use only swings and FVGs first.
Draft study sequence (to validate)
Higher-timeframe context: on the 1h chart, mark relevant swing points, supply/demand areas, and fair value gaps. 4h or daily optional, not required in version one.
Point of interest: wait for price to reach an area. If not reached, show "Waiting". Do not invent a setup.
Lower-timeframe setup (1m): a candle-body close through a relevant swing level as market-structure-shift evidence, plus a same-direction fair value gap as support.
Other-market check: show whether the corresponding setup is present, missing, or conflicting in the other market. Do not require identical levels or candle shapes.
Additional timeframes: let the user review 3m and 5m for supporting or conflicting evidence. Not mandatory until the exact rule is confirmed.
Result states, each with its evidence shown: WAITING, SETUP FORMING, CONFIRMED, CONFLICTING. "Confirmed" means only that the defined conditions were observed, not that a trade is safe or likely to win.
Rules and safety
[ ] ICT 7 has its own toggle, state, pattern definitions, rules, labels, and results, and is independently testable.
[ ] It may display candle names as context but must not reuse ICT 6's Hold or Trade decisions, and must not change ICT 6's patterns, colours, or signals. If it needs a different pattern, define it separately.
[ ] Do not label a pattern as a buy/sell instruction. No order submission, routing, or automation.
[ ] Keep ICT 1–6 unchanged. Read this as "ICT 7 work must not alter them", not "freeze them" for layers still in progress (ICT 3, 5, 6).
[ ] Record both successful and failed examples during testing.
Order of work

A. Inspect the chart architecture and data sources. B. Add and test the independent two-pane layout. C. Confirm pane and timeframe arrangement with you. D. Confirm exact ICT 7 rules (other-market confirmation, 3m/5m evidence). E. Implement ICT 7 as its own layer. F. Run tests, typecheck, and build; verify ICT 1–6 and single-chart behavior.

Suggested order across layers
Save the Mac copy to a backup branch and push.
ICT 3 (report, clone, strip, build).
ICT 6 chart checks and open items.
ICT 5 swing-point design, then ICT 2's future work for sweeps and HH/HL.
ICT 4 trendlines.
Two-chart layout, then ICT 7.
AI layer and screen layout
AI analysis remains independently switchable from the ICT layer and must not replace or modify the main chart.
When enabled, show candidate swing points on the chart and a discussion panel beneath it, with text and speech controls.
When AI is enabled, the chart-and-panel column scrolls vertically so the chart is not permanently compressed; the AI panel has readable text, adjustable space, and a quick expand/restore control.
AI-generated swing ideas are described as uncertain, not confirmed predictions. Confirmed pivots can be explained from candle data.
External-provider chat requires the user's own API key; never request that secret in chat. A keyless, rules-based Chart Coach was proposed and still awaits your choice.
Local use and market data
Keep the local workflow simple and the chart on port 5173; provider setup is optional.
The live Coinbase feed is selected with VITE_ADAPTER=coinbase npm run dev and needs no API key. Do not replace the default demo feed unless asked.
Status (carried over from the previous TODO)
b01cb6a: ICT shows only the latest confirmed high and low labels in view while keeping a neon zigzag; AI structure uses an alternating neon zigzag; AI chat text is larger with expand/restore, a draggable panel up to 480 px, and a vertically scrollable chart/AI column. Typecheck, zero-warning lint, 211 frontend tests, 12 backend tests, and production build passed.
d682d4e: Coinbase Exchange REST candles and public WebSocket bid/ask ticks as an opt-in adapter; all six crypto pairs supported; orders remain simulated; 30m/4h/weekly aggregated locally. Live read-only conformance suite passed (14 checks), plus typecheck, lint, 222 tests plus 12 backend tests, and build.
24e3912: All ICT marks, connectors, zones, and the automatic zigzag restricted to the three days before the latest displayed candle; manual trendlines use seven days. Only visibility is filtered; saved drawings unchanged. Typecheck, lint, 226 tests plus 12 backend tests, and build passed.
Later: revisit a keyless educational Chart Coach if you want one instead of provider-powered chat.
Not yet captured
Anything decided in yesterday's meeting or this morning that was not discussed here. Add it to this file when the Mac copy is updated (ICT 7 notes and this morning's points).
Coinbase research references
Coinbase Exchange API overview: market-data APIs are public; trading/account endpoints need authentication.
Candle endpoint: values arrive as [time, low, high, open, close, volume]; granularities 1m, 5m, 15m, 1h, 6h, 1d; 300 bars per request.
WebSocket overview and channels: the market-data feed is unauthenticated; ticker messages give live updates.
Public REST rate limits: limited by IP, so candle history is paginated sequentially and should not be polled aggressively.
A read-only BTC-USD candle request succeeded during development (HTTP 200, Access-Control-Allow-Origin: *), and product checks returned HTTP 200 for BTC-USD, ETH-USD, SOL-USD, BNB-USD, XRP-USD, and ADA-USD.