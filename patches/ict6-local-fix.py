#!/usr/bin/env python3
"""Safely adjust the local ICT 6 character-candle file without replacing it."""
from pathlib import Path
import re
import shutil
import sys

path = Path("src/lib/chart-plugins/character-candles/character-candles.ts")
if not path.is_file():
    sys.exit(f"Run this from the project root; not found: {path}")

original = path.read_text()
updated = original


def replace_once(old: str, new: str, description: str) -> None:
    global updated
    count = updated.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match for {description}; found {count}. No file was changed.")
    updated = updated.replace(old, new, 1)


# Retain ICT 6 structure/BOS/CHoCH visuals, but keep setup action words disabled.
replace_once("showStructure: false,", "showStructure: true,", "showStructure default")
if updated.count("actionWords: false,") != 1:
    raise RuntimeError("Expected actionWords: false exactly once; no file was changed.")

# Keep pattern names visible even after a pattern fails/expires.
if updated.count("labelFailed: false,") == 1:
    updated = updated.replace("labelFailed: false,", "labelFailed: true,", 1)
elif updated.count("labelFailed: true,") != 1:
    raise RuntimeError("Could not identify the labelFailed default; no file was changed.")

# Do not suppress a detected pattern/name while its PNG is loading or unavailable.
replace_once("        sprite: HTMLImageElement;", "        sprite: HTMLImageElement | null;", "sprite type")
replace_once("        if (!sprite || !bias) continue;", "        if (!bias) continue;", "pattern detection guard")

# A missing character image must not suppress its pattern label.
anim_line = "        const anim = animating && n >= firstAnimated ? CHARACTER_ANIMATIONS[name] : undefined;"
replace_once(
    anim_line,
    "        const anim = animating && sprite && n >= firstAnimated ? CHARACTER_ANIMATIONS[name] : undefined;",
    "animation guard",
)

# Support the local file's existing one-line or wrapped drawThreeSlice call.
pattern = re.compile(r"(?m)^(\s*)drawThreeSlice\(ctx, sprite, (.+)\);$")
matches = list(pattern.finditer(updated))
if len(matches) != 1:
    raise RuntimeError(f"Expected one drawThreeSlice call; found {len(matches)}. No file was changed.")
updated = pattern.sub(r"\1if (sprite) drawThreeSlice(ctx, sprite, \2);", updated, count=1)

backup = Path.home() / "Desktop" / "character-candles.ts.before-ict6-fix"
shutil.copy2(path, backup)
path.write_text(updated)
print("Updated ICT 6: structure is on; setup action words stay off; pattern labels survive missing sprites and failed/expired patterns.")
print(f"Backup saved to: {backup}")
