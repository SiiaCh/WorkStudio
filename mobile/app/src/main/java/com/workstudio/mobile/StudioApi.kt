package com.workstudio.mobile

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Local development backend. Emulator connects using `adb reverse tcp:3000 tcp:3000`. */
internal object StudioApi {


    internal val ROOT = "https://workstudio-api.onrender.com/api"


    class ApiException(val status: Int, val code: String, override val message: String) : Exception(message)

    fun get(path: String, token: String? = null): JSONObject = request("GET", path, token)

    fun post(path: String, body: JSONObject, token: String? = null, idempotencyKey: String? = null): JSONObject =
        request("POST", path, token, body, idempotencyKey)

    fun escape(value: String): String = URLEncoder.encode(value, "UTF-8")

    private fun request(method: String, path: String, token: String?, body: JSONObject? = null, key: String? = null): JSONObject {
        val connection = URL(ROOT + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 12_000
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            if (!token.isNullOrBlank()) connection.setRequestProperty("Authorization", "Bearer $token")
            if (key != null) connection.setRequestProperty("Idempotency-Key", key)
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                connection.outputStream.use { output -> output.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val input = if (status in 200..299) connection.inputStream else connection.errorStream
            val raw = input?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val root = if (raw.isBlank()) JSONObject() else JSONObject(raw)
            if (status !in 200..299) {
                val error = root.optJSONObject("error")
                throw ApiException(status, error?.optString("code").orEmpty(),
                    error?.optString("message")?.takeIf { it.isNotBlank() } ?: "HTTP $status")
            }
            return root.optJSONObject("data") ?: JSONObject()
        } finally {
            connection.disconnect()
        }
    }
}
