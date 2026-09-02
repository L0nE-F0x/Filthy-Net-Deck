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

-- Match HUD. Pinned so it rides over Arena on every workspace.
-- Arena must run *borderless windowed*: exclusive fullscreen covers the HUD
-- and no compositor rule can lift a window above it.
hl.window_rule({
  match = { title = "^Filthy Net Deck — Overlay$" },
  float = true,
  pin = true,
  no_initial_focus = true,
})

-- Match-end alert. Top-right, 344x104 window with a 16px margin.
-- Must never take focus — Arena keeps input while it is up.
hl.window_rule({
  match = { title = "^Filthy Net Deck — Alert$" },
  float = true,
  pin = true,
  no_initial_focus = true,
  move = "monitor_w-360 16",
})

-- "Running" presence badge. Bottom-left, 158x40 window with a 16px margin.
hl.window_rule({
  match = { title = "^Filthy Net Deck — Running$" },
  float = true,
  pin = true,
  no_initial_focus = true,
  move = "16 monitor_h-56",
})

-- Companion mode uses a different title and is a normal window you can focus,
-- so it is deliberately left to tile like anything else.
