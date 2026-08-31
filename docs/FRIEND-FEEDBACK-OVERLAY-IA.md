# Friend feedback — overlay modes, quiet defaults, IA

**Status:** P0 + P1 **coded, uncommitted, not released.** Owner paused 2026-08-31 to shut the machine down; next session resumes from this file + `handoff.md`.  
**When:** 2026-08-31.  
**Product:** Filthy Net Deck v3.2.0 (live). This work is **not** a release until the owner says so.

A YouTube-community friend who is also a developer sent a detailed ticket after testing the app. The analysis below is the original product-design read. **“Implemented this session”** at the bottom is the code that actually landed — read that before editing overlay files.

---

## The ticket (verbatim, lightly structured)

### Tracking window

I dislike that the tracking window becomes translucent, remains above other windows and disappears when the match ends.

I understand that this is normal behaviour for an overlay, but I would like more control over it. I suggest offering two clearly differentiated modes:

1. Overlay mode: compact, always above Arena and visible only during matches.
2. Companion window mode: a normal, opaque and persistent window that the user closes manually.

I would personally prefer the second mode.

### Information during a match

The tracker shows a lot of information at once. My remaining cards, the opponent's revealed cards and some of the icons were not immediately understandable or useful to me during the match.

I would make the default view much simpler and show only the most actionable information, for example:

- Match time and turn.
- Session record.
- Land/non-land draw probability, if reliable.
- The opponent's probable archetype, including a confidence indicator.
- Important contextual alerts.

The complete card lists and detailed statistics could remain available in expandable sections.

I especially like the ability to predict the opponent's archetype. That feels genuinely useful.

### Navigation and organization

The application has many interesting features, but they are presented with similar visual importance, which makes the organization difficult to understand at first.

The section called "Deck" seems to contain several different concepts:

- "My Decks" or "Library".
- "Deck to Beat", which appears to belong to the metagame.
- "Set Radar", which belongs to the Sets section.

I would separate these concepts more clearly.

"Set Radar" currently takes me from Decks to Sets without making that change of context sufficiently obvious. A label such as "Open Set Radar in Sets →" would make the destination clearer.

### Notifications

The notifications take up considerable space and should be dismissible.

After an update, I would prefer:

- One consolidated "What's new" notification.
- A visible close button.
- Dismissed notifications to remain dismissed after restarting the application.
- An optional notification centre where they can be reviewed later.

Three permanent notifications are not notifications; they are tenants.

### Startup

I think "Start with your PC" should be offered during installation and enabled by default, while still allowing the user to disable it.

Since the application needs to be running before Arena starts recording matches, automatic startup seems important to its core purpose.

### Language

I would like a Spanish translation.

There is a lot of information to process, and doing so in another language makes the interface feel even more overwhelming. A Spanish version would also allow me to provide more precise feedback.

### What I like

- Predicting the opponent's archetype during the match.
- Navigating between cards by collector number. I may steal that idea.
- The amount of work and ambition behind the application.

### Summary

The application already has plenty of functionality. My main recommendation is to simplify what is shown by default, improve the information hierarchy and give the user greater control over the tracking window.

The application should help the player make decisions without first requiring them to understand every part of the application.

---

## Grok’s take (2026-08-31)

He’s mostly right about **defaults and control**, and only wrong in a few places where he treated a design choice as a bug, or asked for something the app already has under a different name. Do not rewrite the product to his taste. Ship a **quiet-defaults + two overlay modes** pass and treat him as a design partner — the diagnosis is good.

### The through-line

His last sentence is the whole ticket: the app should help the player decide without first requiring them to understand every part of the app.

That is a real FND problem. The app has grown a lot of good surfaces (overlay, presence badge, toasts, Decks home pulses, coach, digest, hero, 8-deck board) and they currently all look like peers. A developer who *wants* to like it still has to reverse-engineer the information hierarchy. That is not him being picky.

What **not** to do: strip features he didn’t understand. The right move is quieter defaults, clearer labels, and one extra overlay mode.

---

## 1. Tracking window — right about the feeling, slightly wrong about the architecture

**What he hit:** translucent, always-on-top, gone when the match ends. That is the overlay doing its job, not a glitch. Opacity defaults to 92%, idle-dim is on, it is always-on-top, and Rust shows/hides it with match phase. Post-match can linger ~12s if that toggle is on, then it disappears.

Relevant code: `src-tauri/src/overlay.rs`, `src/overlay/OverlayApp.tsx`, `src/overlay/overlayPrefs.ts`, Settings → In-game overlay.

**What he missed:** the companion already exists. It is the main window + tray. Live match data, though, only lives in the overlay webview. The main app does **not** currently host a persistent “match is on” panel (`liveMatch` is not read from pages/components). So if he plays windowed / dual-monitor and wants a normal window he can leave on the other screen, today’s product has no honest answer. Turning overlay off just deletes the HUD.

**Pushback:** do not replace overlay with companion. Overlay is the reason FND is useful *during* a game on one monitor over borderless Arena. Untapped-class tools ship both for a reason.

**Make him happy:** two named modes, exactly as he sketched.

| Mode | Behaviour |
|------|-----------|
| **Overlay (keep as default)** | Compact, always-on-top, over Arena, match-lifetime. Today’s HUD. |
| **Companion window** | Opaque, not always-on-top, user closes it, survives match end. Dual-monitor / “I hate overlays” path. |

Do **not** add a fourth WebView. Handoff measured ~795 MB with main + overlay + presence. Companion should be a mode of the existing overlay window (drop transparency + always-on-top + auto-hide) and/or a live panel inside the main app. Same data, different chrome.

Offer the choice on first overlay appearance, and in Settings → In-game overlay. His preferred mode as opt-in is enough. Changing the default for everyone would punish the people the HUD was built for.

Stopgap he can use today without a build: opacity 100%, idle-dim off, start expanded off, click-through off. He still cannot get “normal window that I close myself.” That gap is real.

---

## 2. In-match information — right about default view, wrong that the extra data is useless

**He’s right that the expanded overlay is a lot.** Full remaining library with per-card draw %, opponent revealed list, sideboard, plus a chip pile (turn, play/draw, mulligans, Bo1/Bo3, ranked, clock, season W–L). Icons without labels will bounce off a first-time user, especially not in English.

**He’s slightly wrong that remaining cards / revealed cards aren’t useful.** Those *are* the decision aids once you’re fetching, milling, or trying to name the deck. They should not be the first thing on screen.

Important: **the product already agrees with him on density, then hides it.** `overlayStartExpanded` defaults to **false**. Collapsed bar is already closer to his list (clock, season record, library count, lands left, turn). If he saw “everything at once,” he either expanded it, or the collapsed bar still has too many unlabeled chips. Both are fixable without a redesign.

His proposed default is a good **collapsed HUD spec**. Mapped to what we have:

| He wants | Today |
|----------|--------|
| Match time + turn | Collapsed bar, if those toggles are on |
| Session record | **Season** W–L on the bar; session W–L only on the post-match card (`PostMatchSummary`) |
| Land/non-land draw % | Lands left as `12L 34%` of library, plus per-card odds in the expanded list. No single “next card is a land: 34%” headline |
| Opponent archetype + confidence | Name is shown; **confidence is already computed (0–1, floor 0.35) in `opponentArchetype.ts` and not displayed on the HUD** |
| Contextual alerts | Separate top-right toast window (`src/toast`) |
| Full lists in expandable sections | Already behind ▾ |

The archetype read is the feature to protect. Showing **confidence** is the cheapest “this feels trustworthy” upgrade on the whole ticket. Right now a guess looks equally gold at 36% and 90%.

**Make him happy:**

- Treat collapsed as the product, expanded as power-user.
- Collapsed line: clock · T*n* · session W–L · land% · archetype + confidence.
- Session record on the bar, not only after the match.
- One land/non-land next-draw number on the bar (inputs already exist).
- Keep lists behind expand; maybe a “Simple HUD” preset that is just that line.
- Tooltips that name the chips. Unlabeled `12L` / `Unrk` is exactly the “not immediately understandable” complaint.

Do not remove the library tracker. Hide it one click down.

---

## 3. Navigation — right that home is a junk drawer, wrong that we should explode it into more pages

Nav today is 8 items (`src/App.tsx` `NAV`): **Decks · My Stats · Climb · Matchups · Sets · Format Hub · Events · Settings**. Keys 1–8.

What he called “the Deck section” is the **Decks home** (`src/pages/Daily.tsx`), which currently stacks:

1. Tracker onboarding coach (until the first-session loop is done)
2. Session wrap
3. **BanPulse** (B&R) — dismissible, destination `Format Hub →`
4. **SpoilerPulse** (“Set Radar”) — **not** dismissible, CTA is `Open →`, jumps to Sets
5. **Deck to beat** (today’s #1 meta list)
6. The 8-deck board
7. Catch-up digest, coach, timeline, personal meta, opponent-archetype panel

He mixed three different products into one page, which is proof the page is wrong, not that the concepts should be merged.

Specifics:

- **“My Decks / Library”** is not under Decks. It is **My Stats → Your decks**. That misread is a naming problem. “Decks” sounds like *his* decks; it is *today’s ranked board*.
- **“Deck to beat”** belongs on that board. It is the #1 of the format, not a random module. Keep the copy — it is good — but the kicker should read as meta, not inventory.
- **Set Radar** is the Sets page. The pulse on Decks is a cross-link with a weak CTA. His suggested **“Open Set Radar in Sets →”** is correct and cheap. BanPulse already does this better.

**Do not add nav items.** Eight is already the keyboard map. The fix is home hygiene: Decks = today’s board + hero. Pulses get quieter and labeled. Library stays in My Stats; if anything, a one-line “Your lists live in My Stats” on Decks for first-run.

---

## 4. Notifications — he’s right, and “tenants” is a fair roast

What’s already true:

- **What’s New** already exists (`StatusBanners`), is one banner, has **Got it**, and **stays dismissed across restarts** (`bbi.lastSeenVersion`). That part of the ticket is already shipped.
- **Update “Later”** is session-only (`dismissedUpdateVersion` in the Zustand store). Next launch it comes back. He’s right that this is annoying.
- **BanPulse** is dismissible and stays gone (`markBansSeen`).
- **SpoilerPulse is not dismissible.** It sits on Decks until the set event expires. That is a tenant.
- **Tracker onboarding** is not a notification but occupies the same slot until the first-session loop completes.
- Incident / “tracking is down” is **correctly** non-dismissible.

“Three permanent notifications are not notifications; they are tenants” is the line worth quoting back. On a fresh Decks visit you can easily have What’s New + Set Radar pulse + onboarding (or B&R) all competing.

**Make him happy, without building a Gmail inbox:**

- Every pulse except incidents gets an **×**, persisted.
- Set Radar pulse: dismiss + clearer destination label.
- Update “Later” persists for that version (Settings still shows it).
- One **What’s new** after an update — already the model; don’t stack it with pulses.
- A tiny “Recent alerts” list in Settings is enough “notification centre.” Don’t build a fourth window.

---

## 5. Start with PC — right about the product, wrong about silent default-on

The feature exists: Settings → **Start with your PC** (`src/services/autostart.ts`), `--hidden` to tray so login isn’t a popup. Default is **off**. The installer does not ask.

His reason is correct: if FND is not running before Arena, matches are missed. That is the core loop.

Silent **default-on at install** — push back:

- Login items feel like adware if you didn’t tick them.
- SmartScreen / AV already side-eye a new companion.
- macOS wants visible consent for login items anyway.
- Power users and shared PCs will hate it.

**Make him happy:** ask, don’t assume.

- NSIS checkbox, **unchecked** by default, with one line of why.
- Or a first-run prompt after the log-file coach: *“FND has to be running before Arena or matches are missed. Start with Windows?”* Default **Yes** on that prompt is informed consent; silent installer default-on is not.

Same destination, much less trust damage.

---

## 6. Spanish — valid ask, wrong next slice

There is no i18n stack. Overlay, Settings, Decks, help, toasts, site, privacy — all English strings in JSX.

He’s not wrong that a dense English UI is harder in a second language. He’s also describing a **release of its own**, and it will not fix hierarchy. A Spanish overlay on top of the same junk-drawer home is still a junk drawer.

Tell him:

- Yes, tracking it. LATAM/Spain Arena is a real audience.
- Not this pass. Half-translated UI is worse than English.
- He can keep sending feedback in Spanish; that does not need a product translation.

If you ever do it, start with the **in-match HUD + nav labels**, not the marketing site.

---

## Where he is actually wrong

1. **Overlay hide-on-match-end is a defect.** It’s a HUD. The missing piece is a second mode, not “stop being an overlay.”
2. **Companion doesn’t exist.** The main app is the companion; live data just isn’t wired into it as a persistent panel.
3. **Library / revealed cards are noise.** They’re power-user tools in the wrong default slot.
4. **Autostart default-on at install.** Product-correct, socially wrong.
5. **Spanish will make the app feel simple.** Language is load; IA is the load. Fix IA first.
6. **More separation = more nav.** We already have eight destinations. Relabel and unstack Decks home; don’t grow the sidebar.

---

## How to make him happy (sequenced)

A single “control and quiet defaults” theme, not a rewrite. Owner said go 2026-08-31.

### P0 — Overlay modes + quiet HUD (this is the ticket) — DONE in working tree

1. Overlay vs companion-window mode. ✅
2. Collapsed HUD = his list, including **session** record, **land%**, **archetype + confidence**. ✅
3. Lists stay behind expand. ✅
4. First-run: “HUD over Arena, or a normal window?” ✅

### P1 — Decks home + pulses — DONE except optional rename

5. SpoilerPulse dismiss + “Open Set Radar in Sets →”. ✅
6. Pulses no longer look equal to the 8-deck board. ✅
7. Update “Later” persists. ✅
8. Optional: rename mental model of Decks (“Today’s board”) vs My Stats (“Your decks”). **Skipped** (nav already 8 items; Daily eyebrow already says “Today’s lists”). Deck-to-beat kicker now reads `{format} meta · BO1`.

### P2 — Autostart as a question — DONE in working tree (first-run ask)

9. First-run prompt on Decks after the Help tour. Not silent default-on.
   NSIS installer checkbox **not** in this slice (custom installer page,
   untestable on Linux). Same Settings toggle either way.

### Later

10. Spanish / i18n — **in progress this session** (Arena language set, in-app).
11. Notification centre only if pulses still feel like tenants after they can be dismissed.

**Out of this release:** new pages, OBS overlay, i18n, ripping out the library tracker, changing overlay default for existing users.

---

## How to talk to him

Answer as a friend who took the notes, not as a changelog. Three things matter:

1. **Name what already exists** so he doesn’t think he was ignored (collapsed overlay, opacity/dim/click-through, What’s New + Got it, autostart in Settings, BanPulse dismiss, archetype inference).
2. **Agree in his words** on two-mode overlay, quieter HUD, confidence, dismissible Set Radar, clearer “this goes to Sets.”
3. **Push back once**, clearly: autostart won’t be silent-on; lists stay, just not in the face; Spanish is a later slice; companion is a mode, not a replacement.

Stopgap he can use *tonight* without a build (until this pass is released): Settings → overlay opacity 100%, dim off, start expanded off, density Minimal, and ignore Decks pulses. Companion mode + confidence + dismissible Set Radar are in the uncommitted working tree and need a `tauri:dev` check, then a real version, before he can use them.

**Verdict:** he is not totally wrong on any of the six themes. He is over-scoped on Spanish and autostart-default, and under-aware of knobs that are already there. The product lesson is real: FND currently teaches itself by showing everything.

---

## Implemented this session (2026-08-31, uncommitted)

Owner said go. Grok implemented P0 + cheap P1 on `main` **without committing**. Live app remains v3.2.0. Next session: verify in `tauri:dev`, then owner decides commit vs iterate. **Do not version-bump from this file.**

### Architecture (do not undo)

- **One overlay webview.** Companion is a mode of `overlay` (`src-tauri/src/overlay.rs`), not a fourth renderer. Handoff previously measured ~795 MB with main + overlay + presence.
- **Default stays overlay.** Companion is opt-in. First-run chooser (`overlayWindowModeChosen === false`) is how existing users — including the friend — see the choice once. Do not skip the chooser for people who already have `overlay-geometry.json`.
- **Rust owns hide/show.** JS prefs (`bbi.prefs`) are the Settings UI; the `overlay-window-mode` file in app data is what `tracker.rs` reads before the overlay webview boots. Writes must hit **both** (`setOverlayWindowMode` in the store / `overlay_set_window_mode` invoke).
- **Do not recreate the webview on the main thread** to flip transparency. Runtime mode switch only applies always-on-top + skip-taskbar + title. A leftover transparent flag after overlay→companion is accepted; CSS `--ov-alpha: 1` makes it look opaque. Recreate would have to be a worker thread (see `refuse_if_main_thread` in `lib.rs`).

### Companion behaviour

| Event | Overlay | Companion |
|---|---|---|
| Match start | `show_for_match` | same, unless user closed *this* match id |
| Match idle (after linger) | `hide` | no-op — window stays, OverlayApp holds last live frame |
| User × | n/a | `overlay_user_close` → hide until **next** match id |
| Arena quit | `destroy` (free RAM) | stay up if not user-closed (`on_arena_quit`) |
| Click-through / idle-dim / opacity | as prefs | click-through forced off; no dim; alpha 1 |

`set_window_mode` only clears `USER_CLOSED` when the mode **actually changes**. Prefs:overlay fires on the opacity slider — do not re-apply chrome / reset close-state on every tick. OverlayApp keeps `windowModeRef` for the same reason.

### Quiet HUD (collapsed)

Bar: clock · `Tn` · session W–L (`sessionWindow` + `sessionWl`, not season) · `Land n%` via `landDrawHeadline` · opponent · archetype + `formatConfidencePct`. Confidence was already on `ArchetypeGuess` (`opponentArchetype.ts`, floor 0.35) and unused on the HUD. Personal matchup WR stays on **expand** only. Library / Bo3 / Unrk chips left the collapsed bar; lists still behind ▾.

Archetype + confidence are a **sibling** of the opponent name (`.overlay-opp-arch` `flex-shrink: 0`), not nested in the ellipsizing `.overlay-opp-line`. At the old 228 default the guess vanished (“vs W”). New first-open width is **360**. Viewport fallbacks (overlay webview = panel width): ≤320 drop name + clock; ≤250 shorten land to `n%` and, in companion, drop turn so × fits. Saved `overlay-geometry.json` is not migrated.

### Prefs keys (all on `bbi.prefs` unless noted)

- `overlayWindowMode`: `"overlay"` \| `"companion"` (default overlay)
- `overlayWindowModeChosen`: boolean (chooser until true)
- Rust file `overlay-window-mode`: `overlay` \| `companion`
- `bbi.spoilerPulse.dismissed`: `code:kind:arenaDate` (new event → pulse returns)
- `bbi.dismissedUpdateVersion`: update banner Later, persisted

### Surfaces that know about window mode

Settings → In-game overlay (select) · overlay ⚙ pill (Overlay / Window) · presence badge cog (HUD over Arena / Normal window) · first-match chooser in the overlay itself. `App.tsx` boot syncs JS mode → Rust so tracker hide/show is correct before the overlay webview mounts.

### P1 pulses / Decks home

- `SpoilerPulse` is a BanPulse-shaped row: open button + ✕. CTA **Open Set Radar in Sets →**. Dismiss on CTA and on ×.
- `.home-pulses` wraps BanPulse + SpoilerPulse — quieter than the 8-deck board.
- Daily hero gold line: `{format} meta · {BO1/BO3}`.
- `dismissUpdate` writes `bbi.dismissedUpdateVersion`. Settings still offers the update.

### Tests added

`overlayModel.test.ts`: `normalizeWindowMode`, `formatConfidencePct`, `sessionWl`, `landDrawHeadline`.  
`setPulse.test.ts`: `spoilerPulseDismissKey` changes when the set event changes.

Verified 2026-08-31: `tsc --noEmit`, eslint on touched TS, overlayModel/setPulse vitest, `cargo test --manifest-path src-tauri/Cargo.toml overlay::`, then live `tauri:dev` + Playwright `/?demo#/overlay` and Decks home. Chooser, companion ×, confidence chip, Set Radar dismiss, Update Later persist, Settings Window mode all checked. Hide-on-match-end still needs a real Arena match.

**Next session:** owner reviews, then commit or iterate. Still uncommitted; do not ship.

### Files touched (uncommitted)

```
src-tauri/src/overlay.rs          # mode atomics, show_for_match, user_close, chrome
src-tauri/src/tracker.rs          # show_for_match on playing/ended
src-tauri/src/arena.rs            # on_arena_quit instead of destroy
src-tauri/src/lib.rs              # commands + load_window_mode
src/overlay/overlayModel.ts       # mode + HUD helpers
src/overlay/overlayPrefs.ts       # windowMode / windowModeChosen
src/overlay/OverlayApp.tsx        # chooser, companion hold, quiet bar, close
src/overlay/overlayModel.test.ts
src/services/overlay.ts           # setOverlayWindowMode, overlayUserClose
src/store/useAppStore.ts          # prefs + persist Update Later
src/pages/Settings.tsx            # Window mode select
src/presence/PresenceApp.tsx      # two radios
src/App.tsx                       # boot-sync window mode to Rust
src/components/SpoilerPulse.tsx
src/services/setPulse.ts
src/components/StatusBanners.tsx
src/pages/Daily.tsx
src/index.css                     # chooser, companion, quieter pulses, autostart ask
src/services/autostart.ts         # shouldShowAutostartPrompt
src/services/autostart.test.ts
src/services/helpTour.ts          # bbi.helpSeen.v1 helpers
src/components/AutostartPrompt.tsx
src/components/HelpGuide.tsx      # uses helpTour helpers
package-lock.json                 # incidental: lockfile version 2.8.2 → 3.2.0
```

P2 autostart ask: `AutostartPrompt` on Decks, after the tracker coach / Help tour, never stacks on Help. `bbi.prefs.autostartAsked`. Primary **Start with PC** (informed yes) / **Not now**. Settings toggle marks asked so we do not nag. Not silent-on. NSIS checkbox not in this slice.

Key files if you need to re-ground further:

- Overlay HUD: `src/overlay/OverlayApp.tsx`, `overlayPrefs.ts`, `overlayModel.ts`
- Overlay window: `src-tauri/src/overlay.rs`
- Settings overlay + autostart: `src/pages/Settings.tsx`, `src/services/autostart.ts`
- Decks home: `src/pages/Daily.tsx`
- Pulses: `src/components/SpoilerPulse.tsx`, `BanPulse.tsx`, `StatusBanners.tsx`
- Inference (confidence already computed): `src/services/opponentArchetype.ts`
- Nav: `src/App.tsx` (`NAV`) — do not add items
