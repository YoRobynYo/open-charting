# AI TO-DO (ICT layers)

**Any AI: read this list, work through it one item at a time, in order.**

**Do exactly what an item says. Nothing more.** Do not add features, change
defaults, rename things, tidy up or "improve" anything the item does not name.
If you think something else is needed, write it under "Suggestions" at the
bottom and do not do it. If an item is unclear, ask the owner one question
before you start. Tick an item only when everything in it is done.

When an item is finished, write under it: `Done: <date>, <AI name>. What was
changed. Files changed: <list>. How it was checked. What was NOT checked.`
Any changed file that is not in that list is a mistake. Do not tick an item
from tests alone. The owner confirms it on the chart.
Rules: `AI-WORKING-RULES.md`. Current state: `HANDOFF.md`.

Each ICT layer is separate. Turning one on shows only that layer's things.

## Needs the owner's answer first

- [ ] ICT 6 and ICT 2 now both show BOS/CHoCH and retest/hold/trade. Earlier
      the owner said ICT 6 = characters and names only, and ICT 2 owns the chain.
      Today they said ICT 6 shows names plus BOS/CHoCH plus hold/retest/trade.
      Which is it? Do not change either layer until this is answered.

## ICT 1: Market Structure
- [ ] Nothing requested. Leave alone.

## ICT 2: Sweep / Break / Retest / Trade
Wanted: sweep, then BOS/CHoCH, then retest, hold, trade. No colour markers.
- [ ] Remove the colour dots, triangles and tags that ICT 2 switches on (it
      currently turns on ICT 4 for them). Check by turning ICT 2 on alone.
- [ ] Sweep rule: a sweep only counts if nobody closed through the level first
      and it was the highest high or lowest low of the last 30 candles.
      (Reason: the current rule marks a level "swept" even after a candle has
      already closed through it.)
- [ ] Only draw a break when a sweep set it up.
- [ ] Show the sweep, the BOS/CHoCH line, the retest, hold and trade.
- [ ] Look back one month only.
- [ ] Check on 5m, 15m and 1h with a screenshot.

## ICT 3: Supply and Demand (all to be added, nothing built yet)
Wanted: supply and demand zones, then break, retest, trigger candle and trade,
working between the zones only, nothing else. Its own playbook: it must not
share rules with ICT 2. The repo has no supply and demand code today.
Do these in order. The first item blocks the rest.
- [ ] Owner to define, from their course notes: what makes a supply zone and a
      demand zone, what counts as a break, a retest and a trigger candle, and
      where the trade goes. Do not invent any of these.
- [ ] Supply and demand zones: detect and draw them.
- [ ] Break: a break of a zone.
- [ ] Retest: price comes back to the zone.
- [ ] Trigger candle: the candle that confirms the retest.
- [ ] Trade: the entry after the trigger candle.
- [ ] Everything works between zones only. Nothing is drawn outside a zone.
- [ ] Remove the colour tags that appear with ICT 3.
- [ ] Take the candle-pattern detection out of ICT 3. Candle names are ICT 6's
      job now (decided by the owner). Do not delete the shared pattern code in
      `src/lib/candle-patterns.ts`: ICT 6 uses it.

## ICT 4: undecided
What it was: the older "trade setup" overlay. It draws coloured dots, triangles
and dashed level lines, plus a paper entry, stop and target.
- [ ] Remove the colour tags. Keep the layer in the menu, empty, until the owner
      decides what it is for. Ask before deleting any code.

## ICT 5: AI setup
Today it only shows highs and lows (HH / LL). For later use with AI.
- [ ] Check what it draws now.
- [ ] Extend it to look back one month. Fact: the swing detector keeps only the
      latest 4 points (`ai-swing-structure.ts`), which is why so few appear.

## ICT 6: Candle characters, names, BOS/CHoCH, retest/hold/trade
The owner is not sure this works fully.
- [ ] Characters and names appear on the right candles.
- [ ] BOS/CHoCH lines are in the right places.
- [ ] Retest, Hold and Trade follow the rules below, checked on several charts.
- [ ] The tag at the top left hidden behind the price header: fix.
- [ ] Faded (failed or expired) name tags show again: find out why and decide.
- [ ] Trade rule is a placeholder. Change only when the owner gives their course rule.

Current rules: retest = first candle within 8 candles of the break that reaches
the level and closes on the right side. Hold = the next candle also closes on
the right side. Trade = the candle after the hold.

## Checked so far

- [x] BOS/CHoCH lines drawn by ICT 6, 28 unit tests plus the owner's screenshots
      (Claude, 21 Nov).
- [x] Retest, Hold and Trade tags appear in ICT 6 (Claude, 22 Nov, screenshots).
- [x] Candle names and characters appear in ICT 6 (Claude and the owner's screenshots).
- [x] Found why ICT 2 shows a level as swept after it was broken (Claude, 23 Nov).
- [x] Found ICT 5/AI swing detector limit of 4 points (Claude, 22 Nov).
- [x] Tested entry types on the bundled demo data: none beat random (Claude,
      22 Nov). Small sample, so not proof either way.

## Suggestions (do NOT act on these without the owner's say)

- (none yet)
