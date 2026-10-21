# Changelog

All notable changes to Hiroshi are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/).

## Versioning

`0.MINOR.PATCH`

- The major stays `0` until the desktop shell and the app surface are stable.
  A `1.0.0` would be a promise the project cannot keep yet.
- The minor counts the feature releases and goes up to `255` before `1.0.0`:
  `0.1.0` shipped the cockpit, `0.2.0` shipped the window work and `0.3.0`
  shipped the engine.
- The patch counts the fixes inside a feature release.

The version lives in `package.json`. It is the only place that has to change
for a release.

## [Unreleased]

### Added

- The protocol: one shape module. `engine/src/protocol.ts` now holds the
  operations table and the event union, and the cockpit's client is generated
  from that table: no command hand writes a path or a `fetch`, and the daemon
  routes on the same rows. `EventPayloads` replaced the `data: unknown` event
  bodies, so the store checks every payload it records and the reducer reads
  each event without a cast, failing to compile when an event has no
  projection.
- `bun run test:integration`: the windowed integration test. It starts the app
  as a real process, drives the real window to the Terminal surface, runs a
  command through it, and then closes the window while a second command is
  still going: that one has to finish, succeeded, with its output in the
  daemon's durable log. Nothing in the in-process suite can prove that.
- `.github/workflows/integration.yml`: runs the windowed test on
  `windows-latest`, where a hosted runner has the desktop session a window
  needs, with a deadline of its own so a window that never opens fails in
  minutes instead of hanging.

### Fixed

- The surfaces panel opens at 480 instead of 380, and the resize handle floors
  it at 460. The picker on an empty surface is a 2×2 grid of 196px cards that
  needs 452px before it fits; at 380 the right column was cut off at the panel
  edge. Nothing can drag the panel narrow enough to clip the picker again.

## [0.3.0] - 2026-10-21

### Added

- The engine: a detached local daemon that owns runs. It keeps a SQLite event
  log, exposes HTTP commands and one SSE feed on loopback, and mints a bearer
  token per start in a discovery file with owner-only permissions.
- A run is durable before it has any effect: `run.started` commits before the
  shell spawns, output arrives in batched events, `run.ended` records the exit
  code. A run a crashed daemon died inside is settled as `interrupted` on the
  next start.
- Runs outlive the window. The cockpit spawns the daemon detached with no
  pipes back to it, adopts a daemon another window started, and never kills one
  except from the Restart button.
- The cockpit side of the engine: discovery, a fetch-only client, a pure event
  reducer and a hook that hydrates at a watermark and follows the feed.
- The Terminal surface executes through the engine and draws real output, exit
  codes and truncation. The Daemon settings page shows the process, protocol,
  database and session count, and restarts it.
- `bun run test:engine`, the engine's own suite, and a Linux CI job for it. It
  spawns real daemons and one test starts the engine from a launcher that exits
  immediately to prove the daemon survives the process that started it.
- `docs/engine.mdx`.

## [0.2.0] - 2026-10-21

### Added

- The custom titlebar drags the window. The press records the window and the
  cursor, every move pushes the window by the cursor delta, the release lets
  go. The titlebar regions are the header title, the sidebar strip, the right
  panel strip and the settings strip.
- The maximize button restores the window again, and a double click on the
  titlebar zooms it. The button shows a restore glyph while the window is
  maximized.
- GitHub Actions runs the typecheck and the integration tests on macOS and
  Windows, with the Bun version pinned in `.bun-version`.
- `CHANGELOG.md` and the versioning policy.

### Fixed

- The window never moved when the titlebar was dragged. The OS modal move
  loop (`WM_SYSCOMMAND` with `SC_MOVE|HTCAPTION`) is ignored by the GPUI
  Windows backend, so the app moves the window itself.
- The titlebar press never reached the drag handler. An unfilled in-flow
  `div` gets no GPUI hitbox, so a drag region needs `pointerEvents: 'auto'`.
- The second click on the maximize button did nothing. The native zoom only
  maximizes on Windows, the restore goes through `ShowWindow(SW_RESTORE)`.
- The command palette rows did not follow the pointer. GPUIX has no
  `onHover` prop, the rows use `onMouseEnter`.

### Changed

- `@gpuix/react` moved to the released 0.11.0. 0.10.0 does not export
  `Button`, `Dialog`, `DialogPopup` or `DialogPortal`, so the app could not
  be installed from npm and CI could not typecheck it.
- The integration suite was rewritten against the current cockpit. It
  asserted a swarm UI that the app no longer renders, and all five tests
  failed on a clean checkout.

## [0.1.0] - 2026-10-20

### Added

- The Hiroshi cockpit on GPUIX: the chat transcript, the composer, the
  workspace footer, the conversation sidebar and the inspector.
- A custom titlebar with the window controls, and a transparent native
  titlebar.
- Six settings views, reachable from the sidebar.
- The environment menu, the commit and push modal, and the command palette.
- The right panel with the browser, terminal, files and review surfaces.
- Resizable sidebars and panels.
- The opening, closing, tab switching and row addition and deletion
  animations.
