# Wings of Atreia VTT — Cloudflare multiplayer prototype

This folder is a **backend proof-of-concept scaffold**, separate from the live GitHub Pages frontend. It does not change or replace the working local VTT.

## Zero-cost target

The intended deployment target is Cloudflare Workers Free + SQLite-backed Durable Objects. Current official limits should be checked before deployment and periodically thereafter. On the Free plan, Durable Objects currently list 100,000 requests/day, 13,000 GB-seconds/day, and 5 GB total SQLite-backed Durable Object storage. If a free quota is exceeded, operations of that type fail rather than automatically becoming paid usage. See:

- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/workers/platform/limits/

No paid plan should be enabled for this project without the owner's explicit approval.

## Current prototype endpoints

- `GET /api/health` — health check.
- `POST /api/rooms` with optional JSON `{"title":"Game name"}` — creates a six-character room code and returns a GM key. The GM key must be kept private.
- `GET /api/rooms/{ROOMCODE}?role=player` — WebSocket connection for a player.
- `GET /api/rooms/{ROOMCODE}?role=gm&key={GMKEY}` — WebSocket connection for the GM.
- GM can broadcast a `{"type":"scene","scene":{...}}` message; connected clients receive the snapshot and it is stored in the room's Durable Object.
- Any participant may send `{"type":"ping"}` and receive a `pong`.
- A room allows at most 11 connected participants.

## Important limitations — not production-ready

1. This is only the first connectivity/synchronization scaffold. The existing VTT frontend is not connected to it yet.
2. GM-key room authorization is a prototype measure, not a complete identity system. Do not share the GM key with players.
3. Player-specific token permissions, secure account identity, rate limits, conflict resolution, scene schema validation, asset storage, and robust reconnection/resynchronization still need implementation.
4. The server currently accepts a GM-provided scene snapshot but does not yet validate the VTT's full scene format. Keep this endpoint for development/testing only until validation is added.
5. Room codes are randomly generated; there is not yet a room listing or recovery interface.
6. Do not store private notes or sensitive personal data in this prototype.

## Deployment outline

1. Create a Cloudflare account and keep it on the Free plan.
2. Install Node.js and Wrangler on a computer, then run from this directory:
   - `npm create cloudflare@latest` is **not** needed for this existing Worker scaffold.
   - `npx wrangler login`
   - `npx wrangler deploy`
3. Check the deployment URL with `/api/health`.
4. Test create/join and WebSocket synchronization using separate browser sessions.
5. Do not connect the public VTT UI until the security and state-validation checklist above is addressed.

No API keys or account secrets belong in this repository.
