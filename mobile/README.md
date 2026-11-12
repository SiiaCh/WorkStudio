# WorkStudio Mobile

Android client application for the WorkStudio coworking reservation system.

## Technologies
- Kotlin
- Jetpack Compose
- Android Studio
- REST API
- WorkStudio Backend (Node.js, PostgreSQL)

## Implemented Features
- User registration and login
- Guest workspace browsing
- Persistent user session
- Workspace list and details
- Date and time selection
- Workspace availability checking
- Pricing plans
- Booking creation and history
- Booking conflict handling
- User profile and logout

## How to Run
1. Install Android Studio.
2. Open the `mobile` folder as an Android project.
3. Sync Gradle.
4. Start an Android emulator.
5. Build and run the application.

## Backend

Demo API:
https://workstudio-api.onrender.com/api

The application uses the WorkStudio REST API to load workspaces, tariffs, and bookings.

## Payments

LiqPay sandbox integration is not required for the current MVP demonstration.

Bookings may remain in PENDING_PAYMENT status until payment is completed or the reservation expires.

## Project Scope

This Android application implements client-side functionality only.

Administrative functionality is handled separately.

## Testing

Functional testing is performed by the project QA team.
