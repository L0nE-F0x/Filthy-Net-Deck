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
  for _, w in ipairs(hl.get_windows() or {}) do
    consider(w)
  end
  if not arena then
    for _, ws in ipairs(hl.get_workspaces() or {}) do
      if ws.special then
        local wins = hl.get_workspace_windows(ws) or {}
        if type(wins) == "table" then
          for _, w in ipairs(wins) do
            consider(w)
          end
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
