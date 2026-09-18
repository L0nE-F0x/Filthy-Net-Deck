-- Filthy Net Deck — Hyprland window rules
--
-- Why this file exists: Wayland does not let a client position or raise its own
-- surfaces. FND asks for all of this itself (presence.rs `corner_position`,
-- toast.rs `corner_position`, `always_on_top`, `skip_taskbar`), and every one
-- of those calls is a silent no-op under Wayland.
--
-- The Wayland answer is wlr-layer-shell: the HUD, badge, cog menu
-- and match alert are all promoted to the `overlay` layer at build time
-- (src-tauri/src/layer_shell.rs), which places them from their own anchors and
-- puts them above every window. Layer surfaces are not windows, so the rules
-- and the placement script below never match them on a Wayland session.
--
-- Two things here still matter on every session:
--   * the layer rule immediately below, which keeps FND's own re-stacking
--     invisible;
--   * everything after the Arena rule, which is the X11 / `FND_LAYER_SHELL=0`
--     path, where these really are ordinary windows that would otherwise open
--     centred over the game.
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

-- Keep FND's surfaces from animating when they are re-mapped.
--
-- FND re-maps its own overlay surfaces to take back the top of the layer when
-- something else maps over them (src-tauri/src/hypr.rs). wlr-layer-shell has no
-- raise request and surfaces stack in map order, so an unmap/map is the only
-- way up. Without this rule Hyprland plays its layer open/close animation on
-- each one and the re-stack is a visible blink; with it, it is not noticeable.
hl.layer_rule({
  match = { namespace = "^filthy-net-deck$" },
  no_anim = true,
  animation = "none",
})

-- MTG Arena: do **not** refuse exclusive fullscreen.
--
-- Content recording needs Arena's own 1920×1080 Full Screen mode (OBS/YouTube).
-- `suppress_event = "fullscreen"` was added on the belief that Hyprland would
-- not deliver clicks to overlay surfaces under exclusive fullscreen. That was
-- wrong: overlay is above `IS_LS_UNFOCUSABLE`, and the HUD is clickable with
-- Arena at `fullscreen: 2`. The rule also blocked the 1080p mode the owner
-- actually wants, so it is gone. The X11 / `FND_LAYER_SHELL=0` window rules
-- below still apply to ordinary toplevels.
--
-- Applied at window-map time: restart Arena after changing this file.

-- Match HUD. Pinned so it rides over Arena on every workspace.
--
-- Only reached when FND is *not* on the layer shell -- an X11 session, or
-- `FND_LAYER_SHELL=0`. Under Wayland these four windows are layer surfaces
-- (src-tauri/src/layer_shell.rs), which no window rule matches and which the
-- placement script below cannot see either; the compositor positions them from
-- their own anchors instead. Left in place because it is exactly what those
-- other sessions still need.
hl.window_rule({
  match = { title = "^Filthy Net Deck — Overlay$" },
  float = true,
  no_initial_focus = true,
  border_size = 0,
  rounding = 0,
  no_shadow = true,
  no_blur = true,
})
-- `pin` must be its own rule, applied *after* the float rule above. Hyprland
-- refuses to pin a window that is not already floating, and hyprlua hands one
-- table's keys to the compositor in Lua `pairs()` order, which is undefined --
-- so `pin` next to `float` can be evaluated first and silently no-op. Observed
-- as a live HUD reporting `pinned: false` and sinking behind Arena.
hl.window_rule({ match = { title = "^Filthy Net Deck — Overlay$" }, pin = true })

-- Match-end alert. Top-right with a 16px margin, sized from the window itself
-- so the rule cannot go stale if the alert's dimensions ever change.
-- Must never take focus — Arena keeps input while it is up.
hl.window_rule({
  match = { title = "^Filthy Net Deck — Alert$" },
  float = true,
  no_initial_focus = true,
  border_size = 0,
  rounding = 0,
  no_shadow = true,
  no_blur = true,
  move = "monitor_w-window_w-16 16",
})
-- Separate `pin` rule, for the same reason as the HUD above.
hl.window_rule({ match = { title = "^Filthy Net Deck — Alert$" }, pin = true })

-- "Running" presence badge. Not pinned, and *not* given a static `move`:
-- a monitor-corner rule lands it on the Omarchy bar and on whichever
-- workspace was active when the window mapped. Placement is the script
-- below, which parks it in Arena's own bottom-left and follows Arena's
-- workspace. GTK/WebKitGTK often refuses a client size under 200×200;
-- max_size lets Hyprland clip that so the transparent remainder cannot
-- cover the game.
hl.window_rule({
  match = { title = "^Filthy Net Deck — Running$" },
  float = true,
  no_initial_focus = true,
  no_anim = true,
  border_size = 0,
  rounding = 0,
  no_shadow = true,
  no_blur = true,
  min_size = { 80, 24 },
  max_size = { 420, 80 },
})

-- Cog menu. Own window so the badge never resizes — a later `set_position`
-- is a Wayland no-op, and Hyprland resizes floating windows about their
-- centre, which used to shove the combined surface off-screen.
-- Not pinned: the script below keeps it on Arena's workspace with the badge.
hl.window_rule({
  match = { title = "^Filthy Net Deck — Presence menu$" },
  float = true,
  no_initial_focus = true,
  no_anim = true,
  border_size = 0,
  rounding = 0,
  no_shadow = true,
  no_blur = true,
})

-- Companion mode uses a different title and is a normal window you can focus,
-- so it is deliberately left to tile like anything else.

local FND_ARENA_CLASS = "steam_app_2141910"
local FND_BADGE_TITLE = "Filthy Net Deck — Running"
local FND_MENU_TITLE = "Filthy Net Deck — Presence menu"
local FND_OVERLAY_TITLE = "Filthy Net Deck — Overlay"
local FND_ALERT_TITLE = "Filthy Net Deck — Alert"
local FND_MARGIN = 16
local FND_GAP = 8

-- Passing a special workspace *object* (id -98) is silently ignored.
-- The name string (`special:scratchpad`) is what actually moves the window.
-- Omarchy's Super+S scratchpad is where this box had Arena; the badge stayed
-- on workspace 1 and the game overlay covered it.
local function fnd_ws_sel(ws)
  if not ws then
    return nil
  end
  if ws.special then
    local name = ws.name or ""
    if name:sub(1, 8) == "special:" then
      return name
    end
    return "special:" .. name
  end
  return ws
end

local function fnd_xy(v)
  if type(v) ~= "table" then
    return 0, 0
  end
  return tonumber(v.x or v[1]) or 0, tonumber(v.y or v[2]) or 0
end

-- Omarchy's keybinding menu (`omarchy-menu-keybindings`, Super+K) re-executes
-- this config under a stub `hl` whose fallback object answers *every* index
-- with itself. `ipairs` over that stub never reaches a nil, so the scan spins
-- at 100% CPU forever and Super+K silently stops opening. `rawget` bypasses
-- the stub's `__index`, so it reports an empty list there while real hyprlua
-- arrays are returned untouched.
local function fnd_list(value)
  if type(value) ~= "table" or rawget(value, 1) == nil then
    return {}
  end
  return value
end

local function fnd_find()
  local arena, badge, menu, overlay, alert
  local function consider(w)
    if not w then
      return
    end
    local title = w.title or ""
    if w.class == FND_ARENA_CLASS or title == "MTGA" then
      arena = w
    elseif title == FND_BADGE_TITLE then
      badge = w
    elseif title == FND_MENU_TITLE then
      menu = w
    elseif title == FND_OVERLAY_TITLE then
      overlay = w
    elseif title == FND_ALERT_TITLE then
      alert = w
    end
  end
  for _, w in ipairs(fnd_list(hl.get_windows())) do
    consider(w)
  end
  if not arena then
    for _, ws in ipairs(fnd_list(hl.get_workspaces())) do
      if ws.special then
        for _, w in ipairs(fnd_list(hl.get_workspace_windows(ws))) do
          consider(w)
        end
      end
    end
  end
  return arena, badge, menu, overlay, alert
end

local function fnd_raise(win)
  if not win then
    return
  end
  hl.dispatch(hl.dsp.window.alter_zorder({ mode = "top", window = win }))
  hl.dispatch(hl.dsp.window.bring_to_top({ window = win }))
end

local fnd_placing = false

local function fnd_place()
  if fnd_placing then
    return
  end
  fnd_placing = true
  local ok, err = pcall(function()
    local arena, badge, menu, overlay, alert = fnd_find()
    if not arena then
      return
    end

    local function dock(win, action)
      if not win then
        return
      end
      hl.dispatch(hl.dsp.window.float({ action = "set", window = win }))
      local target = fnd_ws_sel(arena.workspace)
      if target and win.workspace and arena.workspace and arena.workspace.id ~= win.workspace.id then
        hl.dispatch(hl.dsp.window.move({
          workspace = target,
          follow = false,
          window = win,
        }))
      end
      if action then
        action(win)
      end
      fnd_raise(win)
    end

    dock(badge, function(win)
      -- Use the real compositor size. GTK often stays at 200×200; pretending
      -- we resized to 40px parks the *top* of that box in the corner and the
      -- pill (flex-end, at the bottom) falls off the screen.
      local bw, bh = fnd_xy(win.size)
      if bw < 1 then
        bw = 158
      end
      if bh < 1 then
        bh = 40
      end
      local ax, ay = fnd_xy(arena.at)
      local _, ah = fnd_xy(arena.size)
      local want_x = ax + FND_MARGIN
      local want_y = ay + ah - bh - FND_MARGIN
      local bx, by = fnd_xy(win.at)
      if math.abs(bx - want_x) > 2 or math.abs(by - want_y) > 2 then
        hl.dispatch(hl.dsp.window.move({
          x = want_x,
          y = want_y,
          relative = false,
          window = win,
        }))
      end
      if menu then
        dock(menu, function(mw)
          local _, mh = fnd_xy(mw.size)
          if mh < 1 then
            mh = 320
          end
          local menu_x = want_x
          local menu_y = want_y - FND_GAP - mh
          if menu_y < ay + FND_MARGIN then
            menu_y = ay + FND_MARGIN
          end
          local mx, my = fnd_xy(mw.at)
          if math.abs(mx - menu_x) > 2 or math.abs(my - menu_y) > 2 then
            hl.dispatch(hl.dsp.window.move({
              x = menu_x,
              y = menu_y,
              relative = false,
              window = mw,
            }))
          end
        end)
      end
    end)

    dock(overlay, function(win)
      local ax, ay = fnd_xy(arena.at)
      local want_x = ax + FND_MARGIN
      local want_y = ay + FND_MARGIN
      local bx, by = fnd_xy(win.at)
      if math.abs(bx - want_x) > 2 or math.abs(by - want_y) > 2 then
        hl.dispatch(hl.dsp.window.move({
          x = want_x,
          y = want_y,
          relative = false,
          window = win,
        }))
      end
    end)

    dock(alert, function(win)
      local ax, ay = fnd_xy(arena.at)
      local aw, _ = fnd_xy(arena.size)
      local ww, _ = fnd_xy(win.size)
      if ww < 1 then
        ww = 344
      end
      local want_x = ax + aw - ww - FND_MARGIN
      local want_y = ay + FND_MARGIN
      local bx, by = fnd_xy(win.at)
      if math.abs(bx - want_x) > 2 or math.abs(by - want_y) > 2 then
        hl.dispatch(hl.dsp.window.move({
          x = want_x,
          y = want_y,
          relative = false,
          window = win,
        }))
      end
    end)
  end)
  fnd_placing = false
  if not ok then
    print("[filthy-net-deck] place: " .. tostring(err))
  end
end

local function fnd_is_ours(w)
  if not w then
    return false
  end
  local title = w.title or ""
  return w.class == FND_ARENA_CLASS
    or title == "MTGA"
    or title == FND_BADGE_TITLE
    or title == FND_MENU_TITLE
    or title == FND_OVERLAY_TITLE
    or title == FND_ALERT_TITLE
end

hl.on("window.open", function(w)
  if fnd_is_ours(w) then
    fnd_place()
    hl.timer(fnd_place, { timeout = 150, type = "oneshot" })
    hl.timer(fnd_place, { timeout = 500, type = "oneshot" })
  end
end)

hl.on("window.move_to_workspace", function(w)
  if fnd_is_ours(w) then
    fnd_place()
  end
end)

hl.on("window.fullscreen", function(w)
  if w and (w.class == FND_ARENA_CLASS or (w.title or "") == "MTGA") then
    fnd_place()
  end
end)

-- Scratchpad toggle (Super+S) and clicking the game both restack XWayland
-- Proton above the Wayland badge; put it back.
hl.on("workspace.special_active", function()
  fnd_place()
end)

hl.on("window.active", function(w)
  if w and (w.class == FND_ARENA_CLASS or (w.title or "") == "MTGA") then
    fnd_place()
  end
end)

hl.timer(function()
  local arena, badge, _, overlay, alert = fnd_find()
  if arena and (badge or overlay or alert) then
    fnd_place()
  end
end, { timeout = 500, type = "repeat" })

fnd_place()
hl.on("config.reloaded", fnd_place)
