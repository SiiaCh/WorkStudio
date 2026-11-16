package com.workstudio.mobile

import org.json.JSONArray
import org.json.JSONObject

/** Typed views of backend JSON. Parsing is tolerant: missing/null fields never crash the UI. */

internal data class UserProfile(
    val id: String, val name: String, val email: String, val role: String, val emailVerified: Boolean
)

internal data class OpeningHours(val open: String, val close: String)

internal data class Workspace(
    val id: String, val name: String, val type: String, val location: String, val description: String,
    /** Operational status: FREE, OCCUPIED or UNAVAILABLE. */
    val status: String,
    /** Free for the requested interval. */
    val available: Boolean,
    /** WORKSPACE_UNAVAILABLE, WORKSPACE_OCCUPIED_NOW, BOOKING_CONFLICT, FACILITY_CLOSED, INTERVAL_IN_PAST or null. */
    val unavailableReason: String?,
    /** ISO instant: next blocking booking or closing time. */
    val availableUntil: String?
)

internal data class SuggestedDate(val date: String, val locations: List<String>)

internal data class Availability(
    val workspaces: List<Workspace>,
    val suggestedDates: List<SuggestedDate>,
    /** Keys SUN..SAT; null value = closed weekday. */
    val openingHours: Map<String, OpeningHours?>,
    val pollIntervalMs: Long
)

internal data class FreeRange(val startTime: String, val endTime: String)

internal data class WorkspaceSlots(
    val ranges: List<FreeRange>,
    /** WORKSPACE_UNAVAILABLE, FACILITY_CLOSED, NO_AVAILABLE_RANGES or null. */
    val unavailableReason: String?,
    val openingHours: OpeningHours?
)

/** Tariff price is a fixed UAH amount per booking (not per hour). */
internal data class Tariff(val id: String, val name: String, val price: String, val currency: String)

internal data class Booking(
    val id: String, val workspaceName: String, val tariffName: String,
    val date: String, val startTime: String, val endTime: String,
    /** PENDING_PAYMENT, CONFIRMED, CANCELLED, COMPLETED. */
    val status: String,
    /** PAYMENT_TIMEOUT or ADMINISTRATOR when cancelled. */
    val cancellationReason: String?,
    val amount: String, val currency: String,
    /** null, PENDING, SUCCEEDED, REQUIRES_REVIEW, FAILED. */
    val paymentStatus: String?,
    val paymentDeadline: String?,
    val paymentIntegrationAvailable: Boolean,
    /** LIQPAY_TEST, MOCK or null. */
    val paymentProvider: String?
) {
    val isAwaitingPayment: Boolean get() = status == "PENDING_PAYMENT"
}

internal data class BookingPage(val bookings: List<Booking>, val total: Int, val page: Int, val pageSize: Int)

// ---------- JSON helpers ----------

internal fun JSONObject.stringOrNull(key: String): String? =
    if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

internal fun JSONArray?.objects(): List<JSONObject> =
    if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

internal fun JSONArray?.strings(): List<String> =
    if (this == null) emptyList() else (0 until length()).mapNotNull { optString(it).takeIf { s -> s.isNotBlank() } }

private fun JSONObject?.openingHours(): OpeningHours? {
    if (this == null) return null
    val open = stringOrNull("open") ?: return null
    val close = stringOrNull("close") ?: return null
    return OpeningHours(open, close)
}

internal fun JSONObject.toUser() = UserProfile(
    id = optString("id"), name = optString("name"), email = optString("email"),
    role = optString("role"), emailVerified = stringOrNull("emailVerifiedAt") != null
)

internal fun JSONObject.toWorkspace() = Workspace(
    id = optString("id"), name = optString("name"), type = optString("type"),
    location = optString("location"), description = optString("description"),
    status = optString("status"), available = optBoolean("available"),
    unavailableReason = stringOrNull("unavailableReason"), availableUntil = stringOrNull("availableUntil")
)

internal fun JSONObject.toAvailability(): Availability {
    val hours = optJSONObject("facility")?.optJSONObject("openingHours")
    val schedule = buildMap<String, OpeningHours?> {
        if (hours != null) for (day in hours.keys()) put(day, hours.optJSONObject(day).openingHours())
    }
    return Availability(
        workspaces = optJSONArray("workspaces").objects().map { it.toWorkspace() },
        suggestedDates = optJSONArray("suggestedDates").objects().mapNotNull { item ->
            item.stringOrNull("date")?.let { SuggestedDate(it, item.optJSONArray("locations").strings()) }
        },
        openingHours = schedule,
        pollIntervalMs = optLong("recommendedPollIntervalMs", 1000L).coerceIn(1000L, 10_000L)
    )
}

internal fun JSONObject.toSlots() = WorkspaceSlots(
    ranges = optJSONArray("availableRanges").objects().map { FreeRange(it.optString("startTime"), it.optString("endTime")) },
    unavailableReason = stringOrNull("unavailableReason"),
    openingHours = optJSONObject("openingHours").openingHours()
)

internal fun JSONObject.toTariff() = Tariff(
    id = optString("id"), name = optString("name"), price = optString("price"), currency = optString("currency", "UAH")
)

internal fun JSONObject.toBooking() = Booking(
    id = optString("id"), workspaceName = optString("workspaceName"), tariffName = optString("tariffName"),
    date = optString("date"), startTime = optString("startTime"), endTime = optString("endTime"),
    status = optString("status"), cancellationReason = stringOrNull("cancellationReason"),
    amount = optString("amount"), currency = optString("currency", "UAH"),
    paymentStatus = stringOrNull("paymentStatus"), paymentDeadline = stringOrNull("paymentDeadline"),
    paymentIntegrationAvailable = optBoolean("paymentIntegrationAvailable"),
    paymentProvider = stringOrNull("paymentProvider")
)
