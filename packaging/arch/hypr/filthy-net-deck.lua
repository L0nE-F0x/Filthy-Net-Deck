-- Filthy Net Deck — Hyprland window rules
--
-- Why this file exists: Wayland does not let a client position its own
-- surfaces. FND asks for all of this itself (presence.rs `corner_position`,
-- toast.rs `corner_position`, `always_on_top`, `skip_taskbar`), and every one
-- of those calls is a silent no-op under Wayland. Without these rules the
-- match alert and the presence badge open centred over the game.
--
-- Source it from ~/.config/hypr/hyprland.lua (or any file it loads):
--
--     dofile("/usr/share/filthy-net-deck/hypr/filthy-net-deck.lua")
--
-- Written against hyprlua's `hl.window_rule` rather than Omarchy's `o.window`
-- helper, so it also works on a plain Arch + Hyprland setup.
--
-- Two things learned the hard way, both measured rather than assumed:
--
--  * Position arithmetic must use the `monitor_w` / `monitor_h` /
--    `window_w` / `window_h` tokens. The percentage forms (`100%-h-16`) and
--    the bare `h` token parse fine and are then **silently discarded** — the
--    window just falls back to centred, with nothing in `hyprctl
--    configerrors`. A structurally invalid vec2 *is* reported; a semantically
--    unknown token is not.
--
--  * These windows are transparent and undecorated, but Hyprland still draws
--    its own border, rounding and shadow around the surface. Windows and
--    macOS draw nothing, so the frame is Linux-only — and on a window sized
--    larger than what it paints, that frame is very visible over Arena.

-- Match HUD. Pinned so it rides over Arena on every workspace.
-- Arena must run *borderless windowed*: exclusive fullscreen covers the HUD
-- and no compositor rule can lift a window above it.
hl.window_rule({
  match = { title = "^Filthy Net Deck — Overlay$" },
  float = true,
  pin = true,
  no_initial_focus = true,
  border_size = 0,
  rounding = 0,
  no_shadow = true,
  no_blur = true,
})

-- Match-end alert. Top-right with a 16px margin, sized from the window itself
-- so the rule cannot go stale if the alert's dimensions ever change.
-- Must never take focus — Arena keeps input while it is up.
hl.window_rule({
  match = { title = "^Filthy Net Deck — Alert$" },
  float = true,
  pin = true,
  no_initial_focus = true,
  border_size = 0,
  rounding = 0,
  no_shadow = true,
  no_blur = true,
  move = "monitor_w-window_w-16 16",
})

-- "Running" presence badge. Bottom-left, 16px margin.
--
-- Deliberately NOT pinned: the badge reports that FND is watching *this game*,
-- so it belongs on Arena's workspace. Pinned, it followed the user onto every
-- other workspace and sat over whatever was there.
hl.window_rule({
  match = { title = "^Filthy Net Deck — Running$" },
  float = true,
  no_initial_focus = true,
  border_size = 0,
  rounding = 0,
  no_shadow = true,
  no_blur = true,
  move = "16 monitor_h-window_h-16",
})

-- Companion mode uses a different title and is a normal window you can focus,
-- so it is deliberately left to tile like anything else.
