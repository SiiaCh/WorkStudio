# WorkStudio — Android Client MVP

Android client of the WorkStudio coworking booking system. Built with Kotlin and Jetpack Compose; **no administrator screens** are included.

## Implemented

- Guest browsing of workspaces, details, availability and alternative dates
- Registration, login, verified-email flow, persistent local session and logout
- Date/time selection and client-side interval validation
- Workspace list and availability statuses from the backend
- Tariffs and prices provided by the backend (not hard-coded)
- Booking confirmation, server-side conflict handling and booking history
- Client profile and booking/payment status display

**Payment is deferred for this MVP by team agreement.** A booking may remain `PENDING_PAYMENT` and expire after the backend's configured hold period. Do not present unpaid reservations as `CONFIRMED`. The app contains development/sandbox payment integration for a later stage but its payment buttons are disabled in the MVP UI (`paymentsInMvp = false` in `WorkspaceScreen.kt`).

## Run

1. Open the **`mobile`** directory as a project in Android Studio.
2. Let Gradle sync; start an emulator (API 26+).
3. Build and run the `app` configuration.
4. The API used by `StudioApi.kt` is `https://workstudio-api.onrender.com/api`.
5. Internet access is required. A running local PostgreSQL or local Node server is **not** required when using Render.

For local backend development, switch **both** auth and workspaces to the local API. From `backend/` run `npm.cmd run dev`, start the emulator and run `adb reverse tcp:3000 tcp:3000` with Android SDK Platform Tools. Do not switch only one API client.

## Project ownership and testing

- Android: client-side application only (Spaces / Booking / Tariffs / Profile / Auth).
- Backend, PostgreSQL / Neon, server migration and LiqPay merchant credentials are owned by the server team.
- QA owns execution and reporting of test cases. This README is not a test-pass report.

## Secrets and Git

Do not commit `.env`, `local.properties`, APKs, build outputs, signing keys or private credentials. The backend secrets are configured separately on Render; Android needs only the public API origin. Submit mobile changes through the team's Git workflow.
