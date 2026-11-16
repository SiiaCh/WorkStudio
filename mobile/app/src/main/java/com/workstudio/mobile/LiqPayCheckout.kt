package com.workstudio.mobile

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
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
            require(url == "https://www.liqpay.ua/api/3/checkout") { "Unknown LiqPay checkout address" }
            require(checkout.getString("method") == "POST") { "The server returned an invalid payment method" }
            val fields = checkout.getJSONObject("fields")
            val data = fields.getString("data")
            val signature = fields.getString("signature")
            require(data.isNotBlank() && signature.isNotBlank()) { "Incomplete payment data" }
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
        check(prefs.edit().putString(key, newKey).commit()) { "Could not save the payment key" }
        return newKey
    }
}

/** Render provider-hosted checkout, never input payment details into WorkStudio views. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun LiqPayCheckoutScreen(checkout: LiqPayCheckout, onClose: () -> Unit) {
    BackHandler(onBack = onClose)
    Column(modifier = Modifier.fillMaxSize().background(Color(0xFFF7F8FA)).padding(12.dp)) {
        Text("LiqPay — test payment", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF151515))
        Text("Card details are entered only on the LiqPay page. Returning from it does not mean the payment succeeded — " +
            "the booking status is confirmed by the server after LiqPay's callback.", fontSize = 12.sp, color = Color(0xFF92400E))
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = onClose,
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E619C)),
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier.fillMaxWidth()
        ) { Text("Back to bookings · refresh status", fontWeight = FontWeight.Bold) }
        Spacer(Modifier.height(8.dp))
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
