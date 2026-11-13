#!/usr/bin/env bash
# Filthy Net Deck — Linux install, no root.
#
#   curl -fsSL https://filthy-net-deck.com/install.sh | bash
#   curl -fsSL https://filthy-net-deck.com/install.sh | bash -s -- --uninstall
#
# Everything goes under your home folder (~/.local/share/filthy-net-deck), so
# the app can install its own signed updates afterwards — Settings or the
# update banner, "Update & restart", same as on Windows. Nothing here needs
# sudo, and nothing edits your Hyprland config: the one line to add is printed.
#
# Safe to run again: it repairs or upgrades an existing install in place.
# The download is checked against the checksum below before anything is
# installed. The two lines below are written by scripts/build-linux-tarball.mjs
# on every release; do not edit them by hand.
FND_VERSION="3.9.15"
FND_SHA256="0070c77b6d6863f9dac2ad644f3dd47fbf697c8e91e55a7d9351975102ed8db0"

# Everything runs inside main(), called on the last line, so a download cut
# off halfway through `curl | bash` runs nothing at all.
main() {
  set -euo pipefail

  local slug="filthy-net-deck"
  local data="${XDG_DATA_HOME:-$HOME/.local/share}"
  local config="${XDG_CONFIG_HOME:-$HOME/.config}"
  local appdir="$data/$slug"
  local bin="$appdir/$slug"
  local linkdir="$HOME/.local/bin"
  local apps="$data/applications"
  local icons="$data/icons/hicolor"
  local desktop="$apps/$slug.desktop"
  # Written by the app's own "Start with your computer" switch.
  local autostart="$config/autostart/Filthy Net Deck.desktop"
  local pkg_lua="/usr/share/$slug/hypr/$slug.lua"
  local our_lua="$appdir/hypr/$slug.lua"

  say() { printf '  %s\n' "$*"; }
  die() { printf '\n  Filthy Net Deck: %s\n\n' "$*" >&2; exit 1; }

  if [ "$(id -u)" -eq 0 ]; then
    die "run this as yourself, not with sudo — it installs into your home folder."
  fi
  [ "$(uname -s)" = "Linux" ] || die "this installer is for Linux. Windows and macOS: https://filthy-net-deck.com/#download"
  [ "$(uname -m)" = "x86_64" ] || die "only x86_64 builds exist so far (this machine is $(uname -m))."

  if [ "${1:-}" = "--uninstall" ]; then
    uninstall
    return
  fi

  for tool in curl tar sha256sum; do
    command -v "$tool" >/dev/null 2>&1 || die "needs '$tool', which isn't installed."
  done

  local url="https://github.com/L0nE-F0x/Filthy-Net-Deck/releases/download/v${FND_VERSION}/${slug}-${FND_VERSION}-x86_64.tar.gz"
  # Global, not `local`: the EXIT trap runs after main() has returned, when a
  # local would already be gone and the folder would be left behind.
  FND_TMP="$(mktemp -d)"
  trap 'rm -rf "$FND_TMP"' EXIT
  local tmp="$FND_TMP"

  printf '\n  Filthy Net Deck %s\n\n' "$FND_VERSION"
  say "Downloading…"
  curl -fsSL --retry 2 -o "$tmp/fnd.tar.gz" "$url" || die "download failed: $url"
  echo "$FND_SHA256  $tmp/fnd.tar.gz" | sha256sum --check --status \
    || die "the download does not match this release's checksum, so nothing was installed."
  tar -xzf "$tmp/fnd.tar.gz" -C "$tmp"
  local src="$tmp/${slug}-${FND_VERSION}"
  [ -f "$src/$slug" ] || die "the download is missing the app binary."

  # The binary: written beside the old one, then renamed over it, so a copy
  # that is running right now keeps working until it is restarted.
  mkdir -p "$appdir/hypr"
  install -m755 "$src/$slug" "$bin.new"
  mv -f "$bin.new" "$bin"
  install -m644 "$src/$slug.lua" "$our_lua"

  local px
  for px in 32 64 128; do
    install -Dm644 "$src/icon-$px.png" "$icons/${px}x${px}/apps/$slug.png"
  done

  # The launcher entry. Same file name as the pacman package's, and one in
  # ~/.local/share/applications wins over /usr/share, so launchers and the
  # fnd:// sign-in link reach this copy even before the package is removed.
  mkdir -p "$apps"
  sed "s|^Exec=.*|Exec=\"$bin\" %u|" "$src/$slug.desktop" >"$desktop.new"
  mv -f "$desktop.new" "$desktop"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$apps" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "$icons" >/dev/null 2>&1 || true

  # `filthy-net-deck` on the command line. Only a link this script owns is
  # replaced; anything else already at that path is yours and is left alone.
  mkdir -p "$linkdir"
  local link_note=""
  if [ -L "$linkdir/$slug" ] || [ ! -e "$linkdir/$slug" ]; then
    ln -sfn "$bin" "$linkdir/$slug"
  else
    link_note="$linkdir/$slug already exists and isn't from this installer, so it was left alone. It comes before this install on your PATH — remove it if it's an old copy."
  fi

  # Start with your computer: if it was switched on for an older copy, point
  # it at this one. (Off stays off.)
  local autostart_note=""
  if [ -f "$autostart" ] && grep -q "^Exec=.*$slug" "$autostart" && ! grep -qF "Exec=\"$bin\"" "$autostart"; then
    sed -i "s|^Exec=.*|Exec=\"$bin\" --hidden|" "$autostart"
    autostart_note="Start with your computer now opens this copy."
  fi

  say "Installed to $appdir"
  echo
  [ -n "$autostart_note" ] && say "$autostart_note"
  [ -n "$link_note" ] && say "$link_note"

  missing_libraries "$bin"

  local pacman_copy=""
  if command -v pacman >/dev/null 2>&1 && pacman -Q filthy-net-deck-bin >/dev/null 2>&1; then
    pacman_copy="yes"
  fi
  local hypr_uses_pkg=""
  if [ -d "$config/hypr" ] && grep -rqsF "$pkg_lua" "$config/hypr"; then
    hypr_uses_pkg="yes"
  fi

  if [ -n "$hypr_uses_pkg" ]; then
    echo
    say "Your Hyprland config loads the rules from the old package. Change that line to:"
    echo
    say "    dofile(\"$our_lua\")"
    echo
    say "and run: hyprctl reload"
    [ -n "$pacman_copy" ] && say "Do this before removing the package, or Hyprland shows a config error."
  elif [ -d "$config/hypr" ] && ! grep -rqsF "$our_lua" "$config/hypr"; then
    echo
    say "Hyprland (optional): add this line to ~/.config/hypr/hyprland.lua, then: hyprctl reload"
    echo
    say "    dofile(\"$our_lua\")"
  fi

  if [ -n "$pacman_copy" ]; then
    echo
    say "The pacman package is still installed. This copy replaces it — remove the old one with:"
    echo
    say "    sudo pacman -R filthy-net-deck-bin"
  fi

  echo
  if pgrep -x "$slug" >/dev/null 2>&1; then
    say "Filthy Net Deck is running. Quit it from its tray icon and open it again —"
    say "only one copy runs at a time, so opening it now would bring back the old one."
  else
    say "Open Filthy Net Deck from your app launcher."
  fi
  say "From now on it updates itself: Settings → Check for updates → Update & restart."
  echo
}

# The libraries the binary links against, plus (on Arch) the media plugins it
# loads at run time, which no linker check can see: without gst-plugins-good
# the sounds play into nothing, and without gst-libav/gst-plugins-bad YouTube
# trailers have no audio track it can play.
missing_libraries() {
  local bin="$1"
  if command -v pacman >/dev/null 2>&1; then
    local need=(webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg gtk-layer-shell gst-plugins-good gst-libav gst-plugins-bad)
    local miss=() p
    for p in "${need[@]}"; do
      pacman -Q "$p" >/dev/null 2>&1 || miss+=("$p")
    done
    if [ "${#miss[@]}" -gt 0 ]; then
      echo
      printf '  It needs a few system packages first:\n\n      sudo pacman -S --needed %s\n' "${miss[*]}"
    fi
  elif command -v ldd >/dev/null 2>&1; then
    local miss
    miss="$(ldd "$bin" 2>/dev/null | awk '/not found/ {print "      " $1}')"
    if [ -n "$miss" ]; then
      printf '\n  These libraries are missing — install them with your package manager:\n%s\n' "$miss"
      printf '  (WebKitGTK 4.1, GTK 3, gtk-layer-shell and libayatana-appindicator.)\n'
    fi
  fi
}

uninstall() {
  local slug="filthy-net-deck"
  local data="${XDG_DATA_HOME:-$HOME/.local/share}"
  local config="${XDG_CONFIG_HOME:-$HOME/.config}"
  local appdir="$data/$slug"
  local autostart="$config/autostart/Filthy Net Deck.desktop"

  # Only what this installer put there: the link, the launcher and the
  # autostart entry are removed only when they point into its folder.
  if [ -L "$HOME/.local/bin/$slug" ] && [ "$(readlink "$HOME/.local/bin/$slug")" = "$appdir/$slug" ]; then
    rm -f "$HOME/.local/bin/$slug"
  fi
  local f
  for f in "$data/applications/$slug.desktop" "$autostart"; do
    if [ -f "$f" ] && grep -qF "$appdir/$slug" "$f"; then
      rm -f "$f"
    fi
  done
  local px
  for px in 32 64 128; do
    rm -f "$data/icons/hicolor/${px}x${px}/apps/$slug.png"
  done
  rm -rf "$appdir"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$data/applications" >/dev/null 2>&1 || true

  printf '\n  Filthy Net Deck is uninstalled.\n'
  printf '  Your decks, settings and match history are still in %s —\n' "$data/com.filthynetdeck.desktop"
  printf '  delete that folder too if you want them gone.\n'
  if grep -rqsF "$appdir/hypr/$slug.lua" "$config/hypr"; then
    printf '  Remove the dofile(...) line for it from your Hyprland config, or Hyprland shows an error.\n'
  fi
  printf '\n'
}

main "$@"
