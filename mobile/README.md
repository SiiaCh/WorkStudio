# WorkStudio Mobile (Android client)

Android client of the WorkStudio coworking booking system for regular users (role `CLIENT`).
Kotlin + Jetpack Compose, no third-party networking libraries. UI language: English (as in Figma). Administrator screens are intentionally not part of this app.

## Features

| Area | What the app does |
| --- | --- |
| Guest mode | Browse workspaces, statuses, free time ranges and alternative dates without signing in; booking asks to sign in |
| Auth | Registration, login, logout (`POST /auth/logout`), session restore via `GET /auth/me`, only `CLIENT` role is admitted |
| Session | Bearer token encrypted with an Android Keystore AES-GCM key (`SecureSession.kt`); any `401` clears it and returns to login |
| Spaces | Date + From/To selection, live availability (`GET /workspaces/availability`, polled every second while visible), Free / Occupied / Unavailable badges |
| No free places | "No available desks" state with nearest alternative dates from `suggestedDates` |
| Workspace details | Type, zone, features, current status and free time ranges for the day (`GET /workspaces/:id/available-slots`); tapping a range fills From/To |
| Tariffs | Prices loaded from `GET /tariffs` (never hard-coded); a tariff price is a fixed price per booking |
| Booking | Confirmation dialog → `POST /bookings`; `409` conflict / invalid period → clear message and return to selection |
| My bookings | **Calendar** (`GET /bookings/calendar`): month grid with markers for awaiting-payment / confirmed days, tap a day → its bookings, tap a booking → details. **History** (`GET /bookings/history`) with pagination. Status badges, payment deadline countdown, booking details dialog with Pay action |
| Payment | LiqPay **test** hosted checkout in a WebView (`POST /bookings/:id/payments/liqpay`), shown only when the backend reports `paymentIntegrationAvailable`. Card data is entered only on the LiqPay page. The booking is confirmed only by the server after the signed callback; the app just refreshes the status |
| Profile | Name, email, role, email verification status, resend verification, logout |

`PENDING_PAYMENT` is always shown as **Awaiting payment**, never as confirmed. Unpaid holds expire on the server (`CANCELLED` / `PAYMENT_TIMEOUT`).

## Sprint backlog coverage (MOB tasks)

| Backlog task | Where |
| --- | --- |
| Displaying available workspaces | Spaces tab (`SpacesScreens.kt`) |
| Workspace details (name, type, location, description) | Workspace details screen |
| Date selection for checking availability | Spaces tab date picker |
| Workplace, booking date and time slot selection | Spaces tab + details free ranges |
| Selecting a pricing plan | Tariffs tab |
| Booking details and total before payment | Confirm-booking dialog, payment dialog |
| Registration form with validation | `AuthScreens.kt` |
| Login and session handling | `AuthScreens.kt`, `MainActivity.kt`, `SecureSession.kt` |
| Booking calendar interface | Booking tab → Calendar |
| Booking details in the calendar | Calendar → tap booking → details dialog |
| LiqPay payment integration | `LiqPayCheckout.kt`, payment dialog |
| Workplace and date selection for available time slots | Workspace details screen |
| Displaying available time slots | Workspace details screen (`available-slots`) |

## Code structure (`app/src/main/java/com/workstudio/mobile`)

| File | Responsibility |
| --- | --- |
| `StudioApi.kt` | HTTP client (`HttpURLConnection`), JSON envelope, `ApiException`, English error texts |
| `WorkApi.kt` | Typed repository of the client endpoints, all calls on `Dispatchers.IO` |
| `Models.kt` | Data classes and tolerant JSON parsing |
| `Formatters.kt` | Dates/times in the facility timezone, prices, status labels |
| `BookingValidation.kt` | Client-side interval checks (server stays authoritative) |
| `SecureSession.kt` | Keystore-encrypted token storage |
| `Theme.kt` | WorkStudio colours from Figma, shared buttons/badges/banners, tab icons |
| `MainActivity.kt` | App root: session restore, login/guest/client navigation |
| `AuthScreens.kt` | Login and registration |
| `WorkspaceScreen.kt` | `ClientHome`: tabs, availability polling, booking confirmation, payment flow |
| `SpacesScreens.kt` | Workspace list, date/time selection, no-free-places state, workspace details with free ranges |
| `AccountScreens.kt` | My bookings (calendar, history, booking details), tariffs, profile |
| `LiqPayCheckout.kt` | LiqPay hosted checkout WebView and idempotency-key store |

Backend compatibility: written against `backend/docs/API.md` of `main` (commit `217ef44`): `available-slots`, fixed per-booking tariff prices (no billing unit), LiqPay test checkout v7.

## Run

1. Open the **`mobile`** folder in Android Studio.
2. Let Gradle sync, start an emulator (API 26+).
3. Run the `app` configuration, or build from a terminal in `mobile/`:

   ```
   .\gradlew.bat :app:assembleDebug
   .\gradlew.bat :app:testDebugUnitTest
   ```

   APK: `mobile/app/build/outputs/apk/debug/app-debug.apk`.

The app talks to the deployed API `https://workstudio-api.onrender.com/api` (`StudioApi.ROOT`). Internet access is required; the free Render instance can need up to a minute to wake up after inactivity. Cleartext HTTP is disabled in the manifest.

For a local backend: change `StudioApi.ROOT` to `http://127.0.0.1:3000/api`, run `adb reverse tcp:3000 tcp:3000`, and temporarily allow cleartext traffic. Do not commit that change.

## Payments (LiqPay test mode)

- Works only if the server team configured `LIQPAY_TEST_ENABLED`, sandbox keys and a public HTTPS callback on Render. Otherwise the booking card shows that payment is not configured.
- Use only LiqPay's documented test cards on the LiqPay page.
- Returning from the LiqPay page is not proof of payment: tap "Back to bookings · refresh status" and wait for the server status.
- `LiqPayOperationStore` keeps only the idempotency key per booking (no signed checkout data, no card data).

## Tests

- Unit tests: `BookingValidationTest` (TC-03 client-side period validation), `FormattersTest` (time options, labels, dates).
- Functional scenarios TC-01…TC-08 and TC-11 are executed by the QA team; this README is not a test report.

## Secrets and Git

Do not commit `local.properties`, `.env`, APKs, build outputs, keystores or credentials. Android needs only the public API URL; LiqPay private keys stay on the backend.
