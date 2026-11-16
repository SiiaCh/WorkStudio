package com.workstudio.mobile

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Typed repository of the client endpoints. Every call runs on Dispatchers.IO. */
internal object WorkApi {

    data class LoginResult(val token: String, val user: UserProfile)

    private suspend fun <T> io(block: () -> T): T = withContext(Dispatchers.IO) { block() }
    private fun q(value: String) = StudioApi.escape(value)

    // ---------- auth ----------

    suspend fun login(email: String, password: String): LoginResult = io {
        val data = StudioApi.post("/auth/login", JSONObject().put("email", email).put("password", password))
        val token = data.stringOrNull("accessToken") ?: error("The server did not return a token")
        LoginResult(token, data.getJSONObject("user").toUser())
    }

    /** Returns the development verification URL when the server runs in preview e-mail mode. */
    suspend fun register(name: String, email: String, password: String): String? = io {
        StudioApi.post("/auth/register", JSONObject().put("name", name).put("email", email).put("password", password))
            .optJSONObject("emailDelivery")?.stringOrNull("verificationUrl")
    }

    suspend fun resendVerification(email: String): String? = io {
        StudioApi.post("/auth/resend-verification", JSONObject().put("email", email))
            .optJSONObject("emailDelivery")?.stringOrNull("verificationUrl")
    }

    suspend fun me(token: String): UserProfile = io { StudioApi.get("/auth/me", token).getJSONObject("user").toUser() }

    suspend fun logout(token: String) { io { StudioApi.post("/auth/logout", JSONObject(), token) } }

    // ---------- catalog ----------

    suspend fun availability(date: String, start: String, end: String): Availability = io {
        StudioApi.get("/workspaces/availability?date=${q(date)}&startTime=${q(start)}&endTime=${q(end)}").toAvailability()
    }

    suspend fun availableSlots(workspaceId: String, date: String): WorkspaceSlots = io {
        StudioApi.get("/workspaces/${q(workspaceId)}/available-slots?date=${q(date)}").toSlots()
    }

    suspend fun tariffs(token: String): List<Tariff> = io {
        StudioApi.get("/tariffs", token).optJSONArray("tariffs").objects().map { it.toTariff() }
    }

    // ---------- bookings ----------

    suspend fun history(token: String, page: Int, pageSize: Int = 25): BookingPage = io {
        val data = StudioApi.get("/bookings/history?page=$page&pageSize=$pageSize", token)
        BookingPage(
            data.optJSONArray("bookings").objects().map { it.toBooking() },
            data.optInt("total"), data.optInt("page", page), data.optInt("pageSize", pageSize)
        )
    }

    /** Current and upcoming PENDING_PAYMENT / CONFIRMED bookings in [from]..[to] (max 366 days). */
    suspend fun calendar(token: String, from: String, to: String): List<Booking> = io {
        StudioApi.get("/bookings/calendar?fromDate=${q(from)}&toDate=${q(to)}", token)
            .optJSONArray("bookings").objects().map { it.toBooking() }
    }

    suspend fun createBooking(token: String, workspaceId: String, tariffId: String, date: String, start: String, end: String): Booking = io {
        StudioApi.post("/bookings", JSONObject()
            .put("workspaceId", workspaceId).put("tariffId", tariffId)
            .put("date", date).put("startTime", start).put("endTime", end)
            .put("confirm", true), token).getJSONObject("booking").toBooking()
    }

    // ---------- payments ----------

    suspend fun startLiqPay(token: String, bookingId: String, operationKey: String): LiqPayCheckout = io {
        LiqPayCheckout.fromApiResponse(
            StudioApi.post("/bookings/${q(bookingId)}/payments/liqpay", JSONObject(), token, operationKey)
        )
    }

    /** Development-only mock provider. Returns the stored payment status (SUCCEEDED / FAILED). */
    suspend fun mockPayment(token: String, bookingId: String, scenario: String, operationKey: String): String = io {
        StudioApi.post("/bookings/${q(bookingId)}/mock-payments", JSONObject().put("scenario", scenario), token, operationKey)
            .optJSONObject("payment")?.optString("status").orEmpty()
    }
}
