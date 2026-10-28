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
