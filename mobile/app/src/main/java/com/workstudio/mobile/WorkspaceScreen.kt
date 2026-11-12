package com.workstudio.mobile

import android.app.DatePickerDialog
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import java.util.Locale

private val blue = Color(0xFF2E619C)
private val ink = Color(0xFF151515)
private val bg = Color(0xFFF7F8FA)
private val darkGreen = Color(0xFF364D37)
private val green = Color(0xFF166534)
private val lightGreen = Color(0xFF9CDF9E)
private val warning = Color(0xFF92400E)
private val cream = Color(0xFFFEF3C7)
private val red = Color(0xFFAF2626)
private val lightRed = Color(0xFFFEC7C7)
private val kyiv = ZoneId.of("Europe/Kyiv")
// Agreed MVP scope: payment flow will be enabled when the team configures LiqPay.
// UI still displays the server's authoritative payment state and hold deadline.
private const val paymentsInMvp = false

private data class Space(
    val id: String, val name: String, val type: String, val location: String,
    val description: String, val status: String, val available: Boolean,
    val unavailableReason: String, val availableUntil: String
)
private data class SuggestedDate(val date: String, val locations: String)
private data class Tariff(val id: String, val name: String, val price: String, val currency: String)
private data class Booking(
    val id: String, val workspace: String, val tariff: String, val date: String,
    val startTime: String, val endTime: String, val status: String, val amount: String,
    val paymentStatus: String, val paymentDeadline: String, val paymentEnabled: Boolean,
    val paymentProvider: String, val reference: String
)

private fun JSONObject.spaces(): List<Space> = optJSONArray("workspaces").orEmpty().objects().map {
    Space(
        it.optString("id"), it.optString("name"), it.optString("type"),
        it.optString("location"), it.optString("description"), it.optString("status"),
        it.optBoolean("available"), it.optString("unavailableReason"), it.optString("availableUntil")
    )
}
private fun JSONArray?.orEmpty(): JSONArray = this ?: JSONArray()
private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
private fun JSONObject.suggestedDates(): List<SuggestedDate> =
    optJSONArray("suggestedDates").orEmpty().objects().mapNotNull { item ->
        val candidate = item.optString("date")
        if (candidate.isBlank()) null else {
            val locationsArray = item.optJSONArray("locations").orEmpty()
            val locations = (0 until locationsArray.length())
                .map { locationsArray.optString(it) }.filter { it.isNotBlank() }.joinToString(", ")
            SuggestedDate(candidate, locations)
        }
    }
private fun JSONObject.tariffs(): List<Tariff> = optJSONArray("tariffs").orEmpty().objects().map {
    Tariff(it.optString("id"), it.optString("name"), it.optString("price"), it.optString("currency", "UAH"))
}
private fun JSONObject.bookings(): List<Booking> = optJSONArray("bookings").orEmpty().objects().map {
    Booking(
        it.optString("id"), it.optString("workspaceName"), it.optString("tariffName"),
        it.optString("date"), it.optString("startTime"), it.optString("endTime"),
        it.optString("status"), it.optString("amount"), it.optString("paymentStatus"),
        it.optString("paymentDeadline"), it.optBoolean("paymentIntegrationAvailable"),
        it.optString("paymentProvider"), it.optString("reference")
    )
}
/** Visible UI formatting only: prices come from backend, not Figma placeholders. */
private fun moneyLabel(raw: String): String = raw.removeSuffix(".00").ifEmpty { "0" }

private fun displayDate(raw: String): String = try {
    val chosen = LocalDate.parse(raw)
    val label = chosen.format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.ENGLISH))
    if (chosen == LocalDate.now(kyiv)) "Today, $label" else label
} catch (_: Exception) { raw }

/** Lightweight vector icons resembling the Figma tab bar, without extra dependencies. */
@Composable
private fun WorkTabIcon(index: Int, tint: Color) {
    Canvas(Modifier.size(24.dp)) {
        val scale = size.width / 24f
        val line = 1.6.dp.toPx()
        fun at(x: Float, y: Float) = Offset(x * scale, y * scale)
        fun outline(x: Float, y: Float, w: Float, h: Float, radius: Float = 1.4f) {
            drawRoundRect(
                color = tint, topLeft = at(x, y), size = Size(w * scale, h * scale),
                cornerRadius = CornerRadius(radius * scale), style = Stroke(width = line)
            )
        }
        fun rule(x1: Float, y1: Float, x2: Float, y2: Float) =
            drawLine(tint, at(x1, y1), at(x2, y2), strokeWidth = line)
        when (index) {
            0 -> { // Spaces: four outlined squares.
                outline(3f, 3f, 7f, 7f)
                outline(14f, 3f, 7f, 7f)
                outline(3f, 14f, 7f, 7f)
                outline(14f, 14f, 7f, 7f)
            }
            1 -> { // Booking: calendar.
                outline(3f, 5f, 18f, 16f, 2f)
                rule(3f, 10f, 21f, 10f)
                rule(8f, 2.5f, 8f, 7.5f)
                rule(16f, 2.5f, 16f, 7.5f)
            }
            2 -> { // Tariffs: wallet.
                outline(3f, 7f, 18f, 14f, 2f)
                outline(14f, 12f, 9f, 6f, 1.5f)
                rule(6f, 7f, 18f, 3f)
                drawCircle(tint, radius = 1f * scale, center = at(17f, 15f))
            }
            else -> { // Profile.
                drawCircle(tint, radius = 9f * scale, center = at(12f, 12f), style = Stroke(line))
                drawCircle(tint, radius = 3.1f * scale, center = at(12f, 9f), style = Stroke(line))
                drawArc(tint, 200f, 140f, false, topLeft = at(6f, 14f),
                    size = Size(12f * scale, 7f * scale), style = Stroke(line))
            }
        }
    }
}

private fun formatLocalTime(iso: String): String? = try {
    if (iso.isBlank() || iso == "null") null
    else Instant.parse(iso).atZone(kyiv).format(DateTimeFormatter.ofPattern("HH:mm"))
} catch (_: Exception) { null }
private fun remainingSeconds(iso: String, nowEpoch: Long): Long = try {
    (Instant.parse(iso).epochSecond - nowEpoch).coerceAtLeast(0L)
} catch (_: Exception) { 0L }
private fun isFutureDeadline(iso: String): Boolean = try {
    Instant.parse(iso).isAfter(Instant.now())
} catch (_: Exception) { false }
private fun niceError(error: Exception): String = when (error) {
    is StudioApi.ApiException -> when (error.code) {
        "EMAIL_NOT_VERIFIED" -> "Підтвердьте email у Profile, перш ніж бронювати."
        "BOOKING_CONFLICT", "WORKSPACE_OCCUPIED_NOW", "WORKSPACE_UNAVAILABLE" -> "Місце вже зайняте. Оновіть доступність і виберіть інший час."
        "OUTSIDE_OPENING_HOURS", "INVALID_INTERVAL", "BOOKING_IN_PAST" -> "Перевірте дату, час і години роботи коворкінгу."
        "PAYMENT_WINDOW_EXPIRED" -> "Час для оплати минув. Створіть нове бронювання."
        "PAYMENTS_DISABLED", "PAYMENTS_NOT_CONFIGURED" ->
            "LiqPay sandbox ще не налаштований на сервері. Потрібні тестові ключі та публічний HTTPS callback."
        "PAYMENT_ATTEMPT_PENDING" -> "Ця оплата вже розпочата. Поверніться до її сторінки або оновіть бронювання."
        "PAYMENT_ATTEMPT_FINISHED" -> "Ця спроба вже завершилася. Оновіть історію та спробуйте знову, якщо дозволено."
        "PAYMENT_REQUIRES_REVIEW" -> "Платіж потребує перевірки оператором. Не створюйте повторну оплату."
        "UNAUTHENTICATED" -> "Сесія закінчилася. Увійдіть повторно."
        else -> error.message ?: "Помилка сервера"
    }
    else -> error.localizedMessage ?: "Помилка з'єднання із сервером"
}

/** Client area only; authorization and ownership are enforced by the backend. */
@Composable
fun WorkspaceScreen(
    accessToken: String?,
    onLogout: () -> Unit,
    onLoginRequested: () -> Unit = onLogout
) {
    val isGuest = accessToken.isNullOrBlank()
    var tab by remember { mutableIntStateOf(0) }
    var date by remember { mutableStateOf(LocalDate.now(kyiv).plusDays(1).toString()) }
    var start by remember { mutableStateOf("10:00") }
    var end by remember { mutableStateOf("11:00") }
    var spaces by remember { mutableStateOf<List<Space>>(emptyList()) }
    var suggestions by remember { mutableStateOf<List<SuggestedDate>>(emptyList()) }
    var detailsSpace by remember { mutableStateOf<Space?>(null) }
    var nowEpoch by remember { mutableLongStateOf(Instant.now().epochSecond) }
    var tariffs by remember { mutableStateOf<List<Tariff>>(emptyList()) }
    var bookings by remember { mutableStateOf<List<Booking>>(emptyList()) }
    var bookingsTotal by remember { mutableIntStateOf(0) }
    var bookingsPage by remember { mutableIntStateOf(1) }
    var selectedSpace by remember { mutableStateOf<Space?>(null) }
    var selectedTariff by remember { mutableStateOf<Tariff?>(null) }
    var confirmPayment by remember { mutableStateOf<Booking?>(null) }
    var confirmLiqPay by remember { mutableStateOf<Booking?>(null) }
    var hostedCheckout by remember { mutableStateOf<LiqPayCheckout?>(null) }
    var userName by remember { mutableStateOf("") }
    var userEmail by remember { mutableStateOf("") }
    var userRole by remember { mutableStateOf("") }
    var emailVerified by remember { mutableStateOf(false) }
    var verificationUrl by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    // Reuse the same operation key when retrying an uncertain network result.
    var pendingPaymentKey by remember { mutableStateOf<Triple<String, String, String>?>(null) }
    var message by remember { mutableStateOf("") }
    var refresh by remember { mutableIntStateOf(0) }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val intervalError = BookingValidation.message(date, start, end)

    // Invalidate the previous choice when the time interval changes.
    LaunchedEffect(date, start, end) {
        selectedSpace = null
        selectedTariff = null
    }

    LaunchedEffect(tab) {
        if (tab == 1) {
            while (true) {
                nowEpoch = Instant.now().epochSecond
                delay(1000L)
            }
        }
    }

    // A user can always move back from Tariffs to Spaces without losing their selected interval.
    BackHandler(enabled = selectedTariff != null || confirmPayment != null || confirmLiqPay != null) {
        selectedTariff = null
        confirmPayment = null
        confirmLiqPay = null
    }

    LaunchedEffect(tab, date, start, end, refresh, bookingsPage) {
        loading = true
        try {
            when (tab) {
                0 -> {
                    // Never display stale availability for an invalid interval.
                    if (BookingValidation.message(date, start, end) != null) {
                        spaces = emptyList()
                        suggestions = emptyList()
                        loading = false
                    } else {
                    // Poll only while Spaces is visible; cancel on tab/interval change.
                    while (true) {
                        val result = withContext(Dispatchers.IO) {
                            StudioApi.get("/workspaces/availability?date=${StudioApi.escape(date)}" +
                                "&startTime=${StudioApi.escape(start)}&endTime=${StudioApi.escape(end)}")
                        }
                        spaces = result.spaces()
                        suggestions = result.suggestedDates()
                        loading = false
                        // SRS expects visible changes within roughly two seconds.
                        delay(1000L)
                    }
                    }
                }
                1 -> {
                    val result = withContext(Dispatchers.IO) {
                        StudioApi.get("/bookings/history?page=$bookingsPage&pageSize=25", accessToken)
                    }
                    bookings = result.bookings()
                    bookingsTotal = result.optInt("total")
                }
                2 -> {
                    val result = withContext(Dispatchers.IO) { StudioApi.get("/tariffs", accessToken) }
                    tariffs = result.tariffs()
                }
                3 -> {
                    val result = withContext(Dispatchers.IO) { StudioApi.get("/auth/me", accessToken) }
                    val user = result.getJSONObject("user")
                    userName = user.optString("name")
                    userEmail = user.optString("email")
                    userRole = user.optString("role")
                    emailVerified = !user.isNull("emailVerifiedAt")
                }
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            message = niceError(error)
            if (error is StudioApi.ApiException && error.status == 401) onLogout()
        } finally {
            loading = false
        }
    }

    fun requestBooking(space: Space, tariff: Tariff) {
        val error = BookingValidation.message(date, start, end)
        if (error != null) { message = error; tab = 0; return }
        if (!space.available) { message = "Місце вже недоступне. Оновіть дані."; tab = 0; return }
        selectedSpace = space
        selectedTariff = tariff
    }

    // A hosted payment response is not proof of payment. Always refresh the backend history.
    hostedCheckout?.let { checkout ->
        LiqPayCheckoutScreen(checkout = checkout, onClose = {
            hostedCheckout = null
            tab = 1
            refresh++
            message = "Перевіряємо результат на сервері. Якщо callback ще не прийшов, натисніть Refresh."
        })
        return
    }

    Column(Modifier.fillMaxSize().background(bg)) {
        Box(Modifier.weight(1f)) {
            when (tab) {
                0 -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 18.dp, vertical = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    item {
                        Text("Find a workspace", fontSize = 23.sp, color = ink, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp)
                        if (isGuest) {
                            Text("Guest mode — browse freely; sign in to book.", color = blue, fontSize = 12.sp)
                            TextButton(onClick = onLoginRequested) { Text("Sign in", color = blue) }
                        }
                        Text("Choose a place that works for you", fontSize = 12.sp, color = ink, fontWeight = FontWeight.Medium)
                        Spacer(Modifier.height(12.dp))
                        Text("Select date", fontWeight = FontWeight.Bold, color = ink, fontSize = 12.sp)
                        Spacer(Modifier.height(5.dp))
                        OutlinedButton(
                            onClick = {
                                val d = LocalDate.parse(date)
                                DatePickerDialog(ctx, { _, year, month, day ->
                                    date = LocalDate.of(year, month + 1, day).toString()
                                }, d.year, d.monthValue - 1, d.dayOfMonth).apply {
                                    // Android DatePicker expects milliseconds since epoch.
                                    datePicker.minDate = System.currentTimeMillis() - 24L * 60 * 60 * 1000
                                }.show()
                            },
                            modifier = Modifier.fillMaxWidth().height(45.dp),
                            shape = RoundedCornerShape(7.dp),
                            border = BorderStroke(1.dp, ink),
                            colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White)
                        ) {
                            Text(displayDate(date), color = ink, fontWeight = FontWeight.Medium, fontSize = 12.sp, modifier = Modifier.weight(1f), textAlign = TextAlign.Start)
                            WorkTabIcon(1, ink)
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Column(Modifier.weight(1f)) {
                                Text("From", fontSize = 11.sp, color = ink)
                                TimePickerField(start, { start = it })
                            }
                            Column(Modifier.weight(1f)) {
                                Text("To", fontSize = 11.sp, color = ink)
                                TimePickerField(end, { end = it })
                            }
                        }
                        if (intervalError != null) {
                            Spacer(Modifier.height(7.dp))
                            Text(intervalError, color = red, fontSize = 12.sp)
                        }
                        Spacer(Modifier.height(15.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Available workspaces", fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = ink)
                                Text("Choose a workspace to continue", fontSize = 11.sp, color = ink)
                            }
                            TextButton(onClick = { refresh++ }) { Text("Refresh", color = blue, fontSize = 12.sp) }
                        }
                    }
                    if (intervalError == null && loading && spaces.isEmpty()) item { LinearProgressIndicator(Modifier.fillMaxWidth(), color = blue) }
                    if (intervalError == null && spaces.isEmpty() && !loading) item { Text("Немає місць або оберіть інший час.", color = ink) }
                    if (intervalError == null && !loading && spaces.isNotEmpty() && spaces.none { it.available }) {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("No available desks for the selected time", color = red, fontWeight = FontWeight.SemiBold)
                                if (suggestions.isNotEmpty()) {
                                    Text("Try the nearest free date:", fontSize = 12.sp, color = ink)
                                    suggestions.forEach { alternative ->
                                        OutlinedButton(onClick = {
                                            date = alternative.date
                                            selectedSpace = null
                                            selectedTariff = null
                                        }, modifier = Modifier.fillMaxWidth()) {
                                            Text(alternative.date +
                                                if (alternative.locations.isNotBlank()) " · ${alternative.locations}" else "",
                                                color = blue, fontSize = 12.sp)
                                        }
                                    }
                                } else {
                                    Text("Try another time or ask the administrator about other zones.", fontSize = 12.sp)
                                }
                            }
                        }
                    }
                    items(spaces, key = { it.id }) { space ->
                        val unavailable = space.status == "UNAVAILABLE"
                        val free = space.available && !unavailable
                        val label = if (free) "Free" else if (unavailable) "Unavailable" else "Occupied"
                        val pillBg = if (free) lightGreen else if (unavailable) lightRed else cream
                        val pillInk = if (free) green else if (unavailable) red else warning
                        Surface(
                            modifier = Modifier.fillMaxWidth().border(1.dp, ink, RoundedCornerShape(9.dp))
                                .clickable { detailsSpace = space },
                            shape = RoundedCornerShape(9.dp), color = Color.White
                        ) {
                            Column(Modifier.padding(13.dp)) {
                                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.SpaceBetween,
                                    modifier = Modifier.fillMaxWidth()) {
                                    Column(Modifier.weight(1f)) {
                                        Text(space.name, color = ink, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
                                        Text(space.type + " · " + space.location, color = ink, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                                        if (space.description.isNotBlank()) Text(space.description, color = Color.DarkGray, fontSize = 11.sp)
                                    }
                                    Surface(color = pillBg, shape = RoundedCornerShape(10.dp)) {
                                        Text(label, modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp), color = pillInk,
                                            fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                                val until = formatLocalTime(space.availableUntil)
                                Text(
                                    when {
                                        free && until != null -> "◷  Available until $until"
                                        free -> "◷  Available for selected time"
                                        unavailable -> "◷  Currently unavailable"
                                        else -> "◷  Not free for $start–$end"
                                    }, color = ink, fontSize = 12.sp
                                )
                                Spacer(Modifier.height(9.dp))
                                Button(
                                    onClick = {
                                        val error = BookingValidation.message(date, start, end)
                                        when {
                                            error != null -> message = error
                                            free && isGuest -> onLoginRequested()
                                            free -> { selectedSpace = space; selectedTariff = null; tab = 2 }
                                            !unavailable -> message = "Змініть час From / To і перевірте ще раз."
                                        }
                                    },
                                    enabled = !unavailable && !busy && intervalError == null,
                                    colors = ButtonDefaults.buttonColors(containerColor = blue,
                                        disabledContainerColor = Color(0xFFCECECE), disabledContentColor = Color.Gray),
                                    shape = RoundedCornerShape(6.dp), modifier = Modifier.fillMaxWidth().height(43.dp)
                                ) {
                                    Text(if (free) "Book workspace" else if (unavailable) "Unavailable" else "Choose another time",
                                        fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
                1 -> LazyColumn(
                    contentPadding = PaddingValues(horizontal = 18.dp, vertical = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        Text("My bookings", fontSize = 23.sp, fontWeight = FontWeight.ExtraBold, color = ink)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Your reservations", fontSize = 12.sp, modifier = Modifier.weight(1f))
                            TextButton(onClick = { refresh++ }) { Text("Refresh") }
                        }
                    }
                    if (bookings.isEmpty() && !loading) item { Text("У вас поки немає бронювань.") }
                    items(bookings, key = { it.id }) { booking ->
                        Surface(color = Color.White, shape = RoundedCornerShape(9.dp),
                            modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF777777), RoundedCornerShape(9.dp))) {
                            Column(Modifier.padding(14.dp)) {
                                Text(booking.workspace, color = ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                                if (booking.reference.isNotBlank()) Text("Reference: ${booking.reference}", fontSize = 11.sp)
                                Text("${booking.date} · ${booking.startTime}–${booking.endTime}", fontSize = 12.sp)
                                Text("${booking.tariff} · ₴${moneyLabel(booking.amount)}", fontSize = 13.sp)
                                Text("Booking: ${booking.status}", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                Text("Payment: ${booking.paymentStatus.takeUnless { it == "null" || it.isBlank() } ?: "Not paid"}", fontSize = 12.sp)
                                if (booking.status == "PENDING_PAYMENT") {
                                    val secondsLeft = remainingSeconds(booking.paymentDeadline, nowEpoch)
                                    Text("Payment deadline: %02d:%02d".format(secondsLeft / 60, secondsLeft % 60),
                                        fontSize = 12.sp, color = warning)
                                    val canPay = booking.paymentEnabled && isFutureDeadline(booking.paymentDeadline)
                                    if (canPay && paymentsInMvp) {
                                        Spacer(Modifier.height(10.dp))
                                        val liqpay = booking.paymentProvider == "LIQPAY_TEST"
                                        Button(
                                            onClick = {
                                                if (liqpay) confirmLiqPay = booking else confirmPayment = booking
                                            },
                                            enabled = !busy,
                                            colors = ButtonDefaults.buttonColors(containerColor = blue),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Text(if (liqpay) "Pay via LiqPay (sandbox)" else "Test payment (demo)")
                                        }
                                        Text(
                                            if (liqpay) "Тестовий LiqPay. Статус підтверджує лише сервер після callback."
                                            else "Локальна симуляція; гроші не списуються.",
                                            color = Color.Gray, fontSize = 11.sp
                                        )
                                    } else {
                                        Text(
                                            if (!paymentsInMvp) "Оплату відкладено для MVP. Резервування діє лише до дедлайну."
                                            else "Оплата зараз недоступна або час резервування вичерпано.",
                                            color = warning, fontSize = 11.sp
                                        )
                                    }
                                }
                            }
                        }
                    }
                    if (bookingsTotal > 25) item {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = { bookingsPage-- }, enabled = bookingsPage > 1) { Text("Previous") }
                            Text("Page $bookingsPage / ${(bookingsTotal + 24) / 25}", fontSize = 12.sp)
                            TextButton(onClick = { bookingsPage++ }, enabled = bookingsPage * 25 < bookingsTotal) { Text("Next") }
                        }
                    }
                }
                2 -> LazyColumn(
                    contentPadding = PaddingValues(horizontal = 22.dp, vertical = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(30.dp)
                ) {
                    item {
                        Text("Choose your plan", fontSize = 23.sp, fontWeight = FontWeight.ExtraBold, color = ink)
                        Text("Select a tariff for your workspace booking.", fontSize = 12.sp, color = ink, fontWeight = FontWeight.Medium)
                        selectedSpace?.let {
                            Spacer(Modifier.height(8.dp))
                            Text("${it.name} · $date, $start–$end", fontSize = 12.sp, color = blue)
                        }
                    }
                    if (tariffs.isEmpty() && !loading) item {
                        Text("Тарифів поки немає. Їх має створити адміністратор.", color = ink)
                    }
                    items(tariffs, key = { it.id }) { tariff ->
                        val featured = tariff.name.equals("Daily", ignoreCase = true)
                        val fg = if (featured) Color.White else ink
                        Surface(
                            modifier = Modifier.fillMaxWidth().border(1.dp, darkGreen, RoundedCornerShape(8.dp)),
                            color = if (featured) darkGreen else Color.White,
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Column(Modifier.padding(horizontal = 20.dp, vertical = 18.dp)) {
                                Text(tariff.name, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = fg)
                                Text("₴${moneyLabel(tariff.price)}", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = fg)
                                HorizontalDivider(Modifier.padding(vertical = 12.dp), color = if (featured) Color.LightGray else Color(0xFFDDDDDD))
                                Text("Фіксована ціна за одне бронювання",
                                    color = if (featured) Color.White else Color.Gray, fontSize = 11.sp,
                                    modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                                Spacer(Modifier.height(10.dp))
                                OutlinedButton(
                                    onClick = {
                                        if (selectedSpace == null) { message = "Спочатку оберіть місце у Spaces"; tab = 0 }
                                        else requestBooking(selectedSpace!!, tariff)
                                    },
                                    modifier = Modifier.fillMaxWidth().height(43.dp),
                                    shape = RoundedCornerShape(6.dp), border = BorderStroke(1.dp, if (featured) Color.White else darkGreen),
                                    colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White)
                                ) { Text("Select tariff", color = ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                            }
                        }
                    }
                }
                else -> Column(Modifier.fillMaxSize().padding(20.dp)) {
                    Text("My profile", fontSize = 23.sp, color = ink, fontWeight = FontWeight.ExtraBold)
                    Spacer(Modifier.height(20.dp))
                    Text(userName, fontSize = 17.sp, fontWeight = FontWeight.Medium)
                    Text(userEmail, fontSize = 13.sp)
                    Text("Role: $userRole", fontSize = 12.sp, color = Color.Gray)
                    Spacer(Modifier.height(15.dp))
                    Text(if (emailVerified) "✓ Email verified" else "Email not verified",
                        fontWeight = FontWeight.Bold, color = if (emailVerified) green else red)
                    if (!emailVerified && userEmail.isNotBlank()) {
                        Spacer(Modifier.height(9.dp))
                        OutlinedButton(onClick = {
                            scope.launch {
                                busy = true
                                try {
                                    val response = withContext(Dispatchers.IO) {
                                        StudioApi.post("/auth/resend-verification", JSONObject().put("email", userEmail))
                                    }
                                    verificationUrl = response.optJSONObject("emailDelivery")?.optString("verificationUrl").orEmpty()
                                    message = if (verificationUrl.isNotBlank())
                                        "У dev-режимі підтверди email за кнопкою нижче." else
                                        "Запит відправлено. Перевірте пошту (якщо SMTP налаштовано)."
                                } catch (e: Exception) { message = niceError(e) }
                                finally { busy = false }
                            }
                        }, enabled = !busy) { Text("Resend verification") }
                        if (verificationUrl.isNotBlank()) {
                            Button(onClick = {
                                // Development preview token URL: do not log it or share screenshots of it.
                                ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(verificationUrl)))
                            }, colors = ButtonDefaults.buttonColors(containerColor = blue)) { Text("Open verification (dev)") }
                        }
                        TextButton(onClick = { refresh++ }) { Text("Check verification status") }
                    }
                    Spacer(Modifier.height(22.dp))
                    Button(onClick = {
                        scope.launch {
                            busy = true
                            try { withContext(Dispatchers.IO) { StudioApi.post("/auth/logout", JSONObject(), accessToken) } }
                            catch (_: Exception) { /* Clear local token even if connection is lost. */ }
                            finally { busy = false; onLogout() }
                        }
                    }, enabled = !busy, colors = ButtonDefaults.buttonColors(containerColor = blue)) { Text("Logout") }
                }
            }
            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter), color = blue)
        }
        if (message.isNotBlank()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(message, Modifier.weight(1f), color = red, fontSize = 12.sp)
                TextButton(onClick = { message = "" }) { Text("OK") }
            }
        }
        HorizontalDivider(color = Color(0xFFCCCCCC), thickness = 1.dp)
        Row(Modifier.fillMaxWidth().background(Color.White).navigationBarsPadding().height(62.dp),
            horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
            listOf("Spaces", "Booking", "Tariffs", "Profile").forEachIndexed { index, name ->
                Column(Modifier.weight(1f).fillMaxHeight().clickable {
                    if (isGuest && index != 0) {
                        onLoginRequested()
                    } else if (tab != index) {
                        tab = index; message = ""; if (index == 1) bookingsPage = 1
                    }
                }, horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically)) {
                WorkTabIcon(index, if (tab == index) blue else ink)
                    Text(name, fontSize = 10.sp, color = if (tab == index) blue else ink,
                        fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }

    detailsSpace?.let { space ->
        AlertDialog(
            onDismissRequest = { detailsSpace = null },
            title = { Text(space.name) },
            text = { Text("${space.type} · ${space.location}\n${space.description}\n\n" +
                if (space.available) "Available for $date, $start–$end" else "Occupied / unavailable for selected time") },
            confirmButton = { TextButton(onClick = { detailsSpace = null }) { Text("Close") } }
        )
    }

    selectedTariff?.let { tariff ->
        val space = selectedSpace
        AlertDialog(
            onDismissRequest = { selectedTariff = null },
            title = { Text("Confirm booking") },
            text = {
                Text("${space?.name.orEmpty()}\n$date · $start–$end\nTariff: ${tariff.name}\n" +
                    "Total: ₴${moneyLabel(tariff.price)}\n\n" +
                    "Це реальне бронювання у вашій тестовій базі. Час для оплати обмежений.")
            },
            confirmButton = {
                Button(onClick = {
                    val chosen = space ?: return@Button
                    val intervalProblem = BookingValidation.message(date, start, end)
                    if (intervalProblem != null) {
                        message = intervalProblem
                        selectedTariff = null
                        tab = 0
                        return@Button
                    }
                    selectedTariff = null
                    busy = true
                    scope.launch {
                        try {
                            // The backend re-checks the interval and calculates the trusted price.
                            val data = withContext(Dispatchers.IO) {
                                StudioApi.post("/bookings", JSONObject()
                                    .put("workspaceId", chosen.id).put("tariffId", tariff.id)
                                    .put("date", date).put("startTime", start)
                                    .put("endTime", end).put("confirm", true), accessToken)
                            }
                            val booking = data.getJSONObject("booking")
                            message = "Створено бронювання ${booking.optString("status")}. Перегляньте його у вкладці Booking."
                            selectedSpace = null
                            tab = 1
                            bookingsPage = 1
                            refresh++
                        } catch (e: Exception) {
                            message = niceError(e)
                            tab = 0
                            refresh++
                        } finally { busy = false }
                    }
                }, enabled = !busy && space != null, colors = ButtonDefaults.buttonColors(containerColor = blue)) {
                    Text("Confirm")
                }
            },
            dismissButton = { TextButton(onClick = { selectedTariff = null }) { Text("Back") } }
        )
    }

    confirmLiqPay?.let { booking ->
        AlertDialog(
            onDismissRequest = { if (!busy) confirmLiqPay = null },
            title = { Text("LiqPay sandbox checkout") },
            text = {
                Text("${booking.workspace}\n₴${booking.amount}\n\n" +
                    "Відкриється захищена сторінка LiqPay. Використовуйте тільки тестові дані, " +
                    "які надає платіжний провайдер. Жодні платіжні реквізити не надсилаються в WorkStudio.")
            },
            confirmButton = {
                Button(onClick = {
                    confirmLiqPay = null
                    busy = true
                    scope.launch {
                        try {
                            val response = withContext(Dispatchers.IO) {
                                val key = LiqPayOperationStore.getOrCreate(
                                    ctx, booking.id, retryFailed = booking.paymentStatus == "FAILED"
                                )
                                StudioApi.post("/bookings/${booking.id}/payments/liqpay", JSONObject(), accessToken, key)
                            }
                            hostedCheckout = LiqPayCheckout.fromApiResponse(response)
                            message = ""
                        } catch (e: Exception) {
                            message = niceError(e)
                        } finally {
                            busy = false
                        }
                    }
                }, enabled = !busy, colors = ButtonDefaults.buttonColors(containerColor = blue)) {
                    Text("Open LiqPay sandbox")
                }
            },
            dismissButton = { TextButton(onClick = { confirmLiqPay = null }) { Text("Cancel") } }
        )
    }

    confirmPayment?.let { booking ->
        AlertDialog(
            onDismissRequest = { confirmPayment = null },
            title = { Text("Demo payment") },
            text = { Text("${booking.workspace}\n₴${booking.amount}\n\nЦе тільки симуляція оплати. Банківські дані не потрібні, гроші не списуються. Вибери результат тесту.") },
            confirmButton = {
                Button(onClick = {
                    confirmPayment = null
                    busy = true
                    scope.launch {
                        val previous = pendingPaymentKey
                        val key = if (previous?.first == booking.id && previous.second == "success")
                            previous.third else UUID.randomUUID().toString()
                        pendingPaymentKey = Triple(booking.id, "success", key)
                        try {
                            val result = withContext(Dispatchers.IO) {
                                StudioApi.post("/bookings/${booking.id}/mock-payments",
                                    JSONObject().put("scenario", "success"), accessToken, key)
                            }
                            pendingPaymentKey = null
                            val payment = result.optJSONObject("payment")
                            message = if (payment?.optString("status") == "SUCCEEDED")
                                "Тестову оплату виконано. Статус: CONFIRMED."
                            else "Результат тестової оплати: ${payment?.optString("status")}"
                        } catch (e: Exception) { message = niceError(e) }
                        finally { busy = false; refresh++ }
                    }
                }, enabled = !busy, colors = ButtonDefaults.buttonColors(containerColor = blue)) { Text("Simulate success") }
            },
            dismissButton = {
                TextButton(onClick = {
                    confirmPayment = null
                    busy = true
                    scope.launch {
                        val previous = pendingPaymentKey
                        val key = if (previous?.first == booking.id && previous.second == "failure")
                            previous.third else UUID.randomUUID().toString()
                        pendingPaymentKey = Triple(booking.id, "failure", key)
                        try {
                            val result = withContext(Dispatchers.IO) {
                                StudioApi.post("/bookings/${booking.id}/mock-payments",
                                    JSONObject().put("scenario", "failure"), accessToken, key)
                            }
                            pendingPaymentKey = null
                            message = "Тестова оплата: ${result.optJSONObject("payment")?.optString("status")}. Можна спробувати ще раз до дедлайну."
                        } catch (e: Exception) { message = niceError(e) }
                        finally { busy = false; refresh++ }
                    }
                }, enabled = !busy) { Text("Simulate failure") }
            }
        )
    }
}

@Composable
private fun TimePickerField(value: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val times = (8 * 2..22 * 2).map { tick -> "%02d:%02d".format(tick / 2, (tick % 2) * 30) }
    Box {
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth().height(43.dp),
            border = BorderStroke(1.dp, Color(0xFF999999)),
            shape = RoundedCornerShape(7.dp),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White)
        ) { Text(value, color = ink, fontSize = 12.sp) }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            times.forEach { option ->
                DropdownMenuItem(text = { Text(option) }, onClick = { onSelect(option); expanded = false })
            }
        }
    }
}
