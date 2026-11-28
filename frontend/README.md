# WorkStudio Frontend

React + TypeScript + Vite web frontend for the WorkStudio project.

## Run
Requires Node.js and npm.
```bash
npm install
npm run dev
```
Production build:
```bash
npm run build
npm run preview
```

## Implemented in this frontend prototype
- Workspace list with name, type, zone/location, description, seats, operational status and hourly price.
- Search and status filtering.
- Booking date, start time and end time selection.
- Pricing plans display and selection.
- Booking summary with estimated total and client-side conflict checks against demo bookings.
- Registration and login forms with basic client-side validation.
- Admin forms to create/edit/delete workspaces and tariffs.
- Demo state persistence in browser localStorage.
- Responsive desktop/mobile-browser layout.
- API request helper in `src/services/api.ts` for later backend integration.

## Important limitations
This is a frontend prototype using demo data. It does not implement secure authentication, email verification, server-authoritative availability/conflict checks, real booking creation, LiqPay payment, or Google services. Those require the backend and provider configuration. The admin route is not protected by real role-based authorization and must not be deployed as production admin access until backend authorization is connected.

## Admin workspace map (Sprint Backlog 3, WEB)
Admin panel → **Map** tab (`src/components/map/*`, `src/services/workspaces.ts`, `src/map.css`).
- Floor-plan view: each placed workspace is a marker coloured by status (free / occupied / unavailable); search + status filter + counters.
- Placing: select a workspace → "Place on map" / "Move on map" → click the plan. Position is saved as normalized `mapPosition {x,y}` (0..1) via `PATCH /admin/workspaces/:id`. Workspaces without a position are listed under "Not on the map".
- Status change: select a marker → choose Free / Occupied / Unavailable → "Apply status" (`PATCH /admin/workspaces/:id/status`).
  "Unavailable" first loads `GET /admin/workspaces/:id/affected-bookings`, then asks for a CANCEL or REASSIGN decision for every booking and sends one atomic request with `confirm: true`.
- Errors handled: `VERSION_CONFLICT`, `UNRESOLVED_BOOKINGS`, `RESOURCE_BUSY` (retry reuses the same Idempotency-Key).
- Tests: `npm test` (`tests/workspaces.test.mjs`).
