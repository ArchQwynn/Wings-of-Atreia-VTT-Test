# Wings of Atreia VTT — PeerJS Integration

This directory is an isolated integration workspace on `feature/vtt-peerjs-integration`. The branch now carries the current VTT entry files from `main`, plus an opt-in remote multiplayer layer. Nothing has been merged into or deployed from `main`.

## Current integration milestone

- The existing VTT remains the application and renderer; the remote player opens the same VTT in Player Screen mode.
- PeerJS 1.5.5 provides signaling and WebRTC data connections.
- GM can start a session, copy a reusable invitation URL, and approve or reject each incoming join request.
- The initial scene snapshot is built using the VTT's existing player-visibility filter. GM notes/pins and GM-only or unassigned tokens are excluded from that snapshot.
- Snapshot JSON is transferred in ordered chunks, keeping each protocol message below the 64 KiB envelope limit. A 2.6 MB serialized snapshot cap is currently enforced.
- Player camera state remains local when the initial scene is applied.
- The adapter is opt-in. Normal VTT use does not create a PeerJS connection.
- The existing same-device BroadcastChannel Player Screen remains available.

## Current limitations

- This is an initial scene-delivery milestone, not the completed multiplayer VTT.
- GM scene changes are now sent to approved players as debounced, complete scene snapshots. Updates are revision-numbered and preserve each player's local camera. This is an initial live-sync layer, not yet an action-request/authorization gateway.
- Player movement requests and GM approval of game actions are not yet connected to the live VTT.
- Per-player visibility for tokens assigned to specific players is not yet individualized; the current initial snapshot uses the existing general Player Screen visibility filter.
- Props/assets, tactical overlays, conditions, status, media-specific limits, and GM-authoritative Undo/Redo still need dedicated multiplayer integration.
- The adapter currently uses PeerJS's default public signaling configuration. Production TURN relay configuration and real-world network reliability still need to be finalized.
- Display names are labels, not authentication. GM approval is required, but the current adapter is a development integration and must not be treated as a security boundary.
- Host signaling loss ends the session. No host recovery or session restoration is implemented.
- The 25-player target is not validated by this milestone.

## Foundation modules

- `protocol.js`: versioned message envelopes and the 64 KiB message ceiling.
- `authority.js`: host-generation/revision fencing, action authorization helpers, join approval queue, and visibility filtering.
- `lifecycle.js`: explicit connection lifecycle transitions.
- `vtt-adapter.js`: opt-in PeerJS host/join UI, approval queue, and initial snapshot transfer.
- `connection-harness.html`: standalone PeerJS diagnostic harness; it does not load or modify the VTT.

## Next implementation steps

1. Add per-player actor identity and filtered snapshots for All Players, Specific Players, GM Only, and Unassigned objects.
3. Add the authoritative movement request/approval gateway with stale-scene validation and one shared revision sequence.
4. Add bounded media transfer rules for map, token, and asset images, with explicit size validation.
5. Integrate props/assets, tactical shapes, status/conditions, and GM-authoritative Undo/Redo.
6. Validate the integration with targeted new-behavior checks, then run broader regression and multi-participant testing before any merge or deployment.

## Existing foundation tests

The original isolated foundation tests are retained:

```sh
node --test vtt-prototype/multiplayer/tests/*.test.js
```

Passing those tests does not establish that the live VTT integration, production security, TURN relay, or capacity target is complete.
