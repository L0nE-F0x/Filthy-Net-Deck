#!/usr/bin/env python3
"""A virtual mouse via /dev/uinput, so pointer input can be tested for real.

Dev tool, Linux/Wayland only. Nothing ships with this and nothing imports it.

Why it exists: the overlay surfaces are wlr-layer-shell surfaces, and the only
way to know whether one actually receives a click is to send it a real one.
`hyprctl dispatch hl.dsp.cursor.move` **warps** the cursor without generating
pointer events — focus-follows-mouse does not even fire — so it silently
produces "no input was delivered" readings that look like hard evidence and are
worthless. This device goes through libinput exactly as real hardware does.

    scripts/vmouse.py move X Y      move the pointer there
    scripts/vmouse.py click X Y     move there, then left click

Needs write access to /dev/uinput (an ACL grants it to the desktop user on
Omarchy; check with `getfacl /dev/uinput`).

Two traps, both of which produced false alarms before they were understood:

  * **Pointer acceleration.** libinput does not move the cursor 10px for a
    relative step of 10, and the curve depends on speed. `move_to` closes the
    loop against `hyprctl cursorpos` instead of trusting the deltas.
  * **A stationary cursor gets no `enter`.** A surface mapped underneath a
    cursor that is already sitting on it receives nothing until the pointer
    moves, so the click lands nowhere. Always park somewhere else first and
    approach the target — `move` to a far point, then `click` the target.

Validate the whole method against a known-good control before trusting a
negative result: click the Omarchy bar's workspace pips and check the workspace
actually changed. Note the bar auto-hides to y=<screen height>, i.e. off
screen, in which case clicking it proves nothing.
"""

import fcntl
import struct
import sys
import time

EV_SYN, EV_KEY, EV_REL = 0x00, 0x01, 0x02
REL_X, REL_Y = 0x00, 0x01
BTN_LEFT = 0x110
SYN_REPORT = 0

UI_SET_EVBIT = 0x40045564
UI_SET_KEYBIT = 0x40045565
UI_SET_RELBIT = 0x40045566
UI_DEV_CREATE = 0x5501
UI_DEV_DESTROY = 0x5502


def emit(fd, etype, code, value):
    # struct input_event on 64-bit: timeval(16) + type + code + value
    fd.write(struct.pack("llHHi", 0, 0, etype, code, value))
    fd.flush()


def syn(fd):
    emit(fd, EV_SYN, SYN_REPORT, 0)


def open_device():
    fd = open("/dev/uinput", "wb")
    for ev in (EV_KEY, EV_REL, EV_SYN):
        fcntl.ioctl(fd, UI_SET_EVBIT, ev)
    fcntl.ioctl(fd, UI_SET_KEYBIT, BTN_LEFT)
    for rel in (REL_X, REL_Y):
        fcntl.ioctl(fd, UI_SET_RELBIT, rel)
    # name[80], bustype/vendor/product/version, ff_effects_max, 4 * absmax[64]
    dev = struct.pack(
        "80sHHHHi" + "i" * 256,
        b"fnd-test-mouse",
        0x03,  # BUS_USB
        0x1234,
        0x5678,
        1,
        0,
        *([0] * 256),
    )
    fd.write(dev)
    fd.flush()
    fcntl.ioctl(fd, UI_DEV_CREATE)
    # Give the compositor time to notice the new device.
    time.sleep(1.2)
    return fd


def move_by(fd, dx, dy, steps=1):
    """Relative motion in steps, so the compositor sees a real gesture rather
    than one enormous jump."""
    for _ in range(steps):
        if dx:
            emit(fd, EV_REL, REL_X, dx)
        if dy:
            emit(fd, EV_REL, REL_Y, dy)
        syn(fd)
        time.sleep(0.008)


def cursor_now():
    """Ask the compositor where the pointer actually is."""
    import subprocess

    out = subprocess.run(
        ["hyprctl", "cursorpos"], capture_output=True, text=True
    ).stdout.strip()
    cx, cy = out.split(",")
    return int(cx), int(cy)


def move_to(fd, x, y, tolerance=2, tries=200):
    """Closed loop, because libinput applies pointer acceleration: a relative
    step of 10 does not move the cursor 10px, and the curve depends on speed.
    Reading the real position back and correcting converges regardless."""
    for _ in range(tries):
        cx, cy = cursor_now()
        dx, dy = x - cx, y - cy
        if abs(dx) <= tolerance and abs(dy) <= tolerance:
            return True
        # Small steps stay in the slow part of the acceleration curve, where
        # movement is close to 1:1.
        step_x = max(-8, min(8, dx))
        step_y = max(-8, min(8, dy))
        move_by(fd, step_x, step_y)
        time.sleep(0.01)
    return False


def click(fd):
    emit(fd, EV_KEY, BTN_LEFT, 1)
    syn(fd)
    time.sleep(0.08)
    emit(fd, EV_KEY, BTN_LEFT, 0)
    syn(fd)
    time.sleep(0.2)


def main():
    action = sys.argv[1]
    x, y = int(sys.argv[2]), int(sys.argv[3])
    fd = open_device()
    try:
        if not move_to(fd, x, y):
            print(f"warning: settled at {cursor_now()}, wanted {x},{y}")
        else:
            print(f"at {cursor_now()}")
        if action == "click":
            click(fd)
        time.sleep(0.4)
    finally:
        fcntl.ioctl(fd, UI_DEV_DESTROY)
        fd.close()


if __name__ == "__main__":
    main()
