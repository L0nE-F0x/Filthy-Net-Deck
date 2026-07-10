"""Repair mojibake in website/index.html (UTF-8 mis-decoded punctuation)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / "website" / "index.html"
text = p.read_text(encoding="utf-8")

# Longer / more specific sequences first
replacements = [
    ("â€œ", "\u201c"),  # “
    ("â€\x9d", "\u201d"),  # ”
    ("â€", "\u201d"),  # ”
    ("â€™", "\u2019"),  # ’
    ("â€˜", "\u2018"),  # ‘
    ("â€”", "\u2014"),  # —
    ("â€“", "\u2013"),  # –
    ("â€¦", "\u2026"),  # …
    ("Ã—", "\u00d7"),  # ×
    ("â–£", "\u25a3"),  # ▣
    ("â†—", "\u2197"),  # ↗
    ("âš™", "\u2699"),  # ⚙
    ("â˜°", "\u2630"),  # ☰
    ("â˜…", "\u2605"),  # ★
    ("â‡„", "\u21c4"),  # ⇄
    ("â—ˆ", "\u25c8"),  # ◈
]

for bad, good in replacements:
    n = text.count(bad)
    if n:
        text = text.replace(bad, good)
        print(f"replaced {n}x {bad!r} -> {good!r} U+{ord(good):04X}")

# Bump download CTA to current installer
text = text.replace(
    "Filthy-Net-Deck-Setup-0.7.2.exe", "Filthy-Net-Deck-Setup-0.7.3.exe"
)
text = text.replace("v0.7.2", "v0.7.3")

import re

leftovers = sorted(set(re.findall(r"â.{0,4}|Ã.", text)))
if leftovers:
    print("WARNING leftovers:", leftovers)
else:
    print("No mojibake leftovers detected.")

p.write_text(text, encoding="utf-8", newline="\n")
print("wrote", p)

# Spot-check lines
for line in text.splitlines():
    if any(
        k in line
        for k in (
            "<title>",
            "SmartScreen",
            "8 ",
            "today",
            "Fan-made",
            "Live feed",
        )
    ):
        print(" ", line.strip()[:130])
