# Candle character map (characters-v2)

Last updated: 2026-11-17 (corrected)

## Purpose

Each animated character sprite stands for ONE standard candlestick pattern.
The chart label must show the **real pattern name** (e.g. "Hammer"), NOT the
character's firework name.

## Source of truth

The sprite-to-pattern mapping below comes from `PATTERN_TO_CHARACTER` in
`character-candles.patch` (src/lib/chart-plugins/character-candles/character-candles.ts),
i.e. the owner's original decisions. An earlier version of this file was
guessed from screenshots and was wrong for four sprites; this version replaces it.
The colours come from the original "pattern / colour hex" table.

If the code and this file ever disagree, the code wins: update this file.

## Mapping

| Sprite file         | Pattern (label on chart) | Colour hex |
|---------------------|--------------------------|------------|
| sparkler.png        | Hammer                   | #22d3ee    |
| roman-candle.png    | Inverted Hammer          | #67e8f9    |
| comet.png           | Shooting Star            | #f59e0b    |
| falling-ember.png   | Hanging Man              | #fbbf24    |
| grand-finale.png    | Bullish Engulfing        | #39ff14    |
| snuffed-out.png     | Bearish Engulfing        | #ff3b5c    |
| dawn-star.png       | Morning Star             | #4ade80    |
| dusk-star.png       | Evening Star             | #fb7185    |
| skyrocket.png       | Bullish Marubozu         | #16a34a    |
| meteor.png          | Bearish Marubozu         | #dc2626    |

## Status of the work

- Done in the patch: sprites drawn on the chart canvas, stretched to the candle
  body (head and feet keep proportions), animation and particles, new layer
  "ICT Structure 6 - Candle Extras".
- Added in character-candles-with-labels.patch: short leader line plus the real
  pattern name above each character, in the colour from the table above.
- Not done yet: recolouring the sprite PNGs to the table colours (needs
  characters-v2.zip), and checking how it looks on a real chart.
