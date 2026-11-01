
package com.workstudio.mobile

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object WorkApi {


    private val BASE_URL = StudioApi.ROOT


    fun login(email: String, password: String): Result<JSONObject> {
        return request(
            endpoint = "/auth/login",
            method = "POST",
            body = JSONObject().apply {
                put("email", email)
                put("password", password)
            }
        )
    }

    fun register(
        name: String,
        email: String,
        password: String
    ): Result<JSONObject> {
        return request(
            endpoint = "/auth/register",
            method = "POST",
            body = JSONObject().apply {
                put("name", name)
                put("email", email)
                put("password", password)
            }
        )
    }

    private fun request(
        endpoint: String,
        method: String,
        body: JSONObject? = null
    ): Result<JSONObject> {

        var connection: HttpURLConnection? = null

        return try {
            connection = URL(BASE_URL + endpoint)
                .openConnection() as HttpURLConnection

            connection.requestMethod = method
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.setRequestProperty(
                "Content-Type",
                "application/json; charset=UTF-8"
            )
            connection.setRequestProperty(
                "Accept",
                "application/json"
            )

            if (body != null) {
                connection.doOutput = true
                connection.outputStream.use {
                    it.write(
                        body.toString().toByteArray(Charsets.UTF_8)
                    )
                }
            }

            val status = connection.responseCode

            val stream = if (status in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            }

            val response = stream?.bufferedReader()
                ?.use { it.readText() }.orEmpty()

            val json = if (response.isNotBlank()) {
                JSONObject(response)
            } else {
                JSONObject()
            }

            if (status in 200..299) {
                Result.success(json)
            } else {
                val error = json.optJSONObject("error")
                val message = error?.optString("message")
                    ?.takeIf { it.isNotBlank() }
                    ?: "Помилка сервера: HTTP $status"

                Result.failure(Exception(message))
            }

        } catch (e: Exception) {
            Result.failure(e)
        } finally {
            connection?.disconnect()
        }
    }
}
