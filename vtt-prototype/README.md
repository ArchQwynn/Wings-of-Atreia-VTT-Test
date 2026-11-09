# Wings of Atreia VTT — Technical Prototype

This directory is the first proof-of-concept for the Wings of Atreia browser VTT.

## Prototype goals

- Lightweight browser-based 3D tabletop
- Standee-style tokens rather than full 3D character models
- X/Y/Z token positioning
- 30/60/90/120 ft altitude demonstration
- Touch-friendly camera controls
- 2D fallback
- No external game engine dependency for the prototype
- Designed to run from GitHub Pages

## Current scope

This is a **local rendering prototype**. It does not yet provide multiplayer synchronization, authentication, persistent cloud saves, or cloud asset storage. Those are deliberately deferred until the rendering and mobile interaction proof is accepted.

## Planned architecture

- Frontend: GitHub Pages
- Realtime/game state: serverless backend (target: Cloudflare Workers + Durable Objects)
- Large assets: object storage (target: Cloudflare R2)
- Application storage target: 5 GB maximum, with normal usage expected around 2–3 GB

## Acceptance milestone

The next technical milestone is to connect the prototype to a realtime room so that one GM and several players can see the same standee positions and altitude changes without refreshing the page.


## Tactical overlays

The prototype now includes a tactical overlay layer for token auras, line templates, cones, circles/radii, cubes, and directional arrows. Shapes use the existing 5-ft grid and camera projection, can be styled, selected, repositioned, and removed. Auras can optionally follow the currently selected token.

Overlay records are stored separately in browser local storage. They are currently local to that browser/device and are not yet synchronized between players or included in the existing scene JSON export/import. Multiplayer synchronization and unified scene persistence remain future integration work.
