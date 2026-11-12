package com.workstudio.mobile

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.net.URLEncoder
import java.util.UUID

/** The private merchant key stays on the backend. Do not store or log checkout data. */
internal data class LiqPayCheckout(val url: String, val data: String, val signature: String) {
    companion object {
        fun fromApiResponse(response: JSONObject): LiqPayCheckout {
            val checkout = response.getJSONObject("checkout")
            val url = checkout.getString("url")
            require(url == "https://www.liqpay.ua/api/3/checkout") { "Невідома платіжна адреса LiqPay" }
            require(checkout.getString("method") == "POST") { "Сервер повернув неправильний метод оплати" }
            val fields = checkout.getJSONObject("fields")
            val data = fields.getString("data")
            val signature = fields.getString("signature")
            require(data.isNotBlank() && signature.isNotBlank()) { "Неповні дані для оплати" }
            return LiqPayCheckout(url, data, signature)
        }
    }

    fun encodedBody(): ByteArray = ("data=" + URLEncoder.encode(data, "UTF-8") +
        "&signature=" + URLEncoder.encode(signature, "UTF-8")).toByteArray(Charsets.UTF_8)
}

/** Only the stable retry key is persisted; signed checkout data and card data are not. */
internal object LiqPayOperationStore {
    private const val PREFS = "workstudio_liqpay_operations"

    fun getOrCreate(context: Context, bookingId: String, retryFailed: Boolean): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val key = "booking_" + bookingId
        if (!retryFailed) prefs.getString(key, null)?.let { return it }
        val newKey = UUID.randomUUID().toString()
        check(prefs.edit().putString(key, newKey).commit()) { "Не вдалося зберегти ключ платежу" }
        return newKey
    }
}

/** Render provider-hosted checkout, never input payment details into WorkStudio views. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun LiqPayCheckoutScreen(checkout: LiqPayCheckout, onClose: () -> Unit) {
    BackHandler(onBack = onClose)
    Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
        Text("LiqPay sandbox — тестова оплата")
        Text("Повернення зі сторінки не означає успішну оплату. Результат перевіряємо через API.")
        Button(onClick = onClose) { Text("Back to bookings / Refresh") }
        AndroidView(
            modifier = Modifier.fillMaxWidth().weight(1f),
            factory = { context ->
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                            // No HTTP navigation, provider checkout always uses HTTPS.
                            return request.url.scheme != "https"
                        }
                    }
                    postUrl(checkout.url, checkout.encodedBody())
                }
            },
            onRelease = { view -> view.stopLoading(); view.destroy() }
        )
    }
}
