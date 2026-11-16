package com.workstudio.mobile

import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Low-level HTTP client for the WorkStudio REST API.
 * Success envelope: {"data": ...}; error envelope: {"error": {"code", "message", "details"}}.
 * Call only from a background dispatcher (WorkApi does this).
 */
internal object StudioApi {

    /** Deployed backend (Render). For a local backend use http://127.0.0.1:3000/api + adb reverse. */
    const val ROOT = "https://workstudio-api.onrender.com/api"

    class ApiException(
        val status: Int,
        val code: String,
        override val message: String
    ) : Exception(message)

    fun get(path: String, token: String? = null): JSONObject = request("GET", path, token)

    fun post(path: String, body: JSONObject = JSONObject(), token: String? = null, idempotencyKey: String? = null): JSONObject =
        request("POST", path, token, body, idempotencyKey)

    fun escape(value: String): String = URLEncoder.encode(value, "UTF-8")

    private fun request(method: String, path: String, token: String?, body: JSONObject? = null, key: String? = null): JSONObject {
        val connection = URL(ROOT + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            // Render free instances need time to wake up after inactivity.
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            if (!token.isNullOrBlank()) connection.setRequestProperty("Authorization", "Bearer $token")
            if (key != null) connection.setRequestProperty("Idempotency-Key", key)
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            // A proxy/cold-start page can be HTML instead of JSON: never crash on it.
            val root = try { if (raw.isBlank()) JSONObject() else JSONObject(raw) } catch (_: JSONException) { JSONObject() }
            if (status !in 200..299) {
                val error = root.optJSONObject("error")
                throw ApiException(
                    status,
                    error?.optString("code").orEmpty(),
                    error?.optString("message")?.takeIf { it.isNotBlank() } ?: "HTTP $status"
                )
            }
            return root.optJSONObject("data") ?: JSONObject()
        } finally {
            connection.disconnect()
        }
    }
}

/** User-facing English text for any error thrown by the data layer. */
internal fun Throwable.userMessage(): String = when (this) {
    is StudioApi.ApiException -> when (code) {
        "INVALID_CREDENTIALS" -> "Incorrect email or password."
        "EMAIL_ALREADY_REGISTERED" -> "This email is already registered. Sign in or use another email."
        "LOGIN_TEMPORARILY_LIMITED", "TOO_MANY_REQUESTS" -> "Too many attempts. Wait a few minutes and try again."
        "UNAUTHENTICATED" -> "Your session has expired. Please sign in again."
        "FORBIDDEN" -> "This action is not available for your role."
        "EMAIL_NOT_VERIFIED" -> "Confirm your email in Profile before booking."
        "BOOKING_CONFLICT", "WORKSPACE_OCCUPIED_NOW", "WORKSPACE_UNAVAILABLE" ->
            "This workspace was just booked for the selected time. Choose another workspace or time."
        "OUTSIDE_OPENING_HOURS" -> "The coworking is closed at the selected time. Choose a time within opening hours."
        "INVALID_INTERVAL", "INVALID_LOCAL_TIME" -> "The end time must be later than the start time."
        "BOOKING_IN_PAST", "DATE_IN_PAST" -> "Choose a future date and time."
        "WORKSPACE_NOT_FOUND", "TARIFF_NOT_FOUND" -> "The workspace or tariff no longer exists. Refresh the data."
        "BOOKING_NOT_FOUND" -> "Booking not found."
        "PAYMENT_WINDOW_EXPIRED" -> "The payment time has expired and the hold was cancelled. Create a new booking."
        "BOOKING_NOT_PAYABLE" -> "This booking can no longer be paid. Refresh the list."
        "PAYMENTS_DISABLED", "PAYMENTS_NOT_CONFIGURED" -> "LiqPay payments are not configured on the server yet."
        "PAYMENT_ATTEMPT_PENDING" -> "A payment is already in progress. Wait for the result and refresh."
        "PAYMENT_ATTEMPT_FINISHED" -> "This payment attempt has finished. Refresh the list and try again."
        "PAYMENT_REQUIRES_REVIEW" -> "The payment is being reviewed by the operator. Do not pay again."
        "PAYMENT_CONFIGURATION_CHANGED" -> "Payment settings have changed. Contact the administrator."
        "IDEMPOTENCY_KEY_REUSED" -> "Please try the payment again."
        "BOOKING_CHANGED" -> "The booking has changed. Refresh and try again."
        "RESOURCE_BUSY" -> "The server is busy. Try again in a few seconds."
        "VALIDATION_ERROR" -> "Check the entered data. $message"
        else -> if (status >= 500) "The server is temporarily unavailable (HTTP $status). Try again later." else message
    }
    is IOException -> "No connection to the server. Check your internet; the server may need up to a minute to wake up."
    else -> localizedMessage ?: "Unknown error"
}

internal val Throwable.isUnauthenticated: Boolean
    get() = this is StudioApi.ApiException && status == 401
