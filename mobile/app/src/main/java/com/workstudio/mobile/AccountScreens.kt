package com.workstudio.mobile

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val PAGE_SIZE = 25

// ====================== My bookings: calendar + history ======================

/** Payment is offered only while the hold is active and the server reports a configured provider. */
internal fun Booking.canPay(nowEpochSeconds: Long): Boolean =
    isAwaitingPayment && secondsUntil(paymentDeadline, nowEpochSeconds) > 0 &&
        paymentIntegrationAvailable && paymentProvider != null && paymentStatus != "REQUIRES_REVIEW"

internal fun Booking.payButtonLabel(): String = when {
    paymentProvider == "MOCK" -> "Test payment (mock)"
    paymentStatus == "PENDING" -> "Continue LiqPay payment"
    else -> "Pay ₴${moneyLabel(amount)} via LiqPay"
}

@Composable
internal fun BookingsTab(
    token: String, refreshKey: Int, busy: Boolean, locations: Map<String, String>,
    onError: (Exception) -> Unit, onPay: (Booking) -> Unit, onBookNew: () -> Unit
) {
    var calendarMode by rememberSaveable { mutableStateOf(true) }
    var manualRefresh by remember { mutableIntStateOf(0) }
    var details by remember { mutableStateOf<Booking?>(null) }
    var now by remember { mutableLongStateOf(Instant.now().epochSecond) }
    LaunchedEffect(Unit) {
        while (true) { now = Instant.now().epochSecond; delay(1_000L) }
    }
    val reloadKey = refreshKey * 1000 + manualRefresh

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(start = 18.dp, end = 8.dp, top = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { ScreenTitle("My bookings", "Your reservations") }
            TextButton(onClick = { manualRefresh++ }) { Text("Refresh", color = WorkColors.Blue) }
        }
        Row(Modifier.padding(horizontal = 18.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ModeChip("Calendar", calendarMode, Modifier.weight(1f)) { calendarMode = true }
            ModeChip("History", !calendarMode, Modifier.weight(1f)) { calendarMode = false }
        }
        Box(Modifier.weight(1f)) {
            if (calendarMode) BookingCalendar(token, reloadKey, now, onError, onOpen = { details = it }, onBookNew = onBookNew)
            else BookingHistory(token, reloadKey, now, busy, onError, onOpen = { details = it }, onPay = onPay)
        }
    }
    details?.let { booking ->
        BookingDetailsDialog(booking, locations[booking.workspaceId], now, busy,
            onPay = { details = null; onPay(booking) }, onDismiss = { details = null })
    }
}

@Composable
private fun ModeChip(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Surface(
        onClick = onClick, shape = RoundedCornerShapeTariff, modifier = modifier.height(38.dp),
        color = if (selected) WorkColors.Blue else Color.White,
        border = androidx.compose.foundation.BorderStroke(1.dp, WorkColors.Blue)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(label, color = if (selected) Color.White else WorkColors.Blue, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
    }
}

/**
 * Booking calendar (GET /bookings/calendar) with Day / Week / Month views (TC-12..TC-15).
 * Only the client's own PENDING_PAYMENT / CONFIRMED bookings are returned by the server.
 */
@Composable
private fun BookingCalendar(
    token: String, reloadKey: Int, now: Long, onError: (Exception) -> Unit,
    onOpen: (Booking) -> Unit, onBookNew: () -> Unit
) {
    val today = todayInFacility()
    var viewName by rememberSaveable { mutableStateOf(CalendarView.WEEK.name) }
    val view = CalendarView.valueOf(viewName)
    var selected by rememberSaveable { mutableStateOf(today.toString()) }
    val anchor = LocalDate.parse(selected)
    val (from, to) = calendarRange(view, anchor)
    var entries by remember { mutableStateOf<List<Booking>?>(null) }
    var loadError by remember { mutableStateOf("") }
    var retry by remember { mutableIntStateOf(0) }

    LaunchedEffect(from, to, reloadKey, retry) {
        entries = null
        loadError = ""
        while (true) {
            try {
                entries = WorkApi.calendar(token, from.toString(), to.toString())
                loadError = ""
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                // Never show an empty calendar as if it were current data: show the error with Retry.
                if (e.isUnauthenticated) onError(e) else loadError = e.userMessage()
                return@LaunchedEffect
            }
            delay(15_000L)
        }
    }

    val inRange = entries.orEmpty().filter { it.date >= from.toString() && it.date <= to.toString() }
        .sortedWith(compareBy({ it.date }, { it.startTime }))
    val byDate = inRange.groupBy { it.date }
    val prevEnabled = !calendarRange(view, shiftPeriod(view, anchor, -1)).second.isBefore(today)

    LazyColumn(
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                CalendarView.entries.forEach { option ->
                    ModeChip(option.label, option == view, Modifier.weight(1f)) { viewName = option.name }
                }
            }
        }
        item {
            Surface(color = Color.White, shape = CardShape, modifier = Modifier.fillMaxWidth().border(1.dp, WorkColors.Ink, CardShape)) {
                Column(Modifier.padding(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TextButton(
                            onClick = { selected = shiftPeriod(view, anchor, -1).let { if (it.isBefore(today)) today else it }.toString() },
                            enabled = prevEnabled
                        ) { Text("‹", fontSize = 20.sp) }
                        Text(periodTitle(view, anchor), Modifier.weight(1f), textAlign = TextAlign.Center,
                            fontWeight = FontWeight.ExtraBold, color = WorkColors.Ink)
                        TextButton(onClick = { selected = shiftPeriod(view, anchor, 1).toString() }) { Text("›", fontSize = 20.sp) }
                    }
                    if (view != CalendarView.DAY) {
                        Row {
                            listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun").forEach {
                                Text(it, Modifier.weight(1f), textAlign = TextAlign.Center, fontSize = 11.sp, color = WorkColors.Muted)
                            }
                        }
                        val gridStart = from.minusDays(from.dayOfWeek.value - 1L)
                        val rows = if (view == CalendarView.MONTH) ((from.dayOfWeek.value - 1) + from.lengthOfMonth() + 6) / 7 else 1
                        for (row in 0 until rows) {
                            Row {
                                for (col in 0 until 7) {
                                    val date = gridStart.plusDays(row * 7L + col)
                                    if (!date.isBefore(from) && !date.isAfter(to)) {
                                        CalendarDay(
                                            day = date.dayOfMonth, isToday = date == today, isSelected = date == anchor,
                                            isPast = date.isBefore(today),
                                            statuses = byDate[date.toString()].orEmpty().map { it.status }.distinct(),
                                            modifier = Modifier.weight(1f), onClick = { selected = date.toString() }
                                        )
                                    } else Spacer(Modifier.weight(1f).aspectRatio(1f))
                                }
                            }
                        }
                    }
                    if (entries == null && loadError.isBlank()) {
                        LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 6.dp), color = WorkColors.Blue)
                    }
                    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        LegendDot(WorkColors.Brown, "Awaiting payment")
                        LegendDot(WorkColors.DarkGreen, "Confirmed")
                    }
                }
            }
        }
        if (loadError.isNotBlank()) {
            item {
                Text(loadError, color = WorkColors.Red, fontSize = 12.sp)
                Spacer(Modifier.height(6.dp))
                SecondaryButton("Retry", onClick = { retry++ })
            }
            return@LazyColumn
        }
        if (entries == null) return@LazyColumn
        item {
            Text("Current and upcoming active bookings. Past and cancelled ones are in History.", fontSize = 11.sp, color = WorkColors.Muted)
        }
        if (inRange.isEmpty()) {
            // TC-15: empty period -> message and a way to the booking screen.
            item {
                EmptyState("No upcoming bookings found")
                Spacer(Modifier.height(8.dp))
                PrimaryButton("Book a workspace", onClick = onBookNew)
            }
            return@LazyColumn
        }
        // Month: bookings of the tapped day. Week / Day: every booking of the period grouped by day.
        val shownDays = if (view == CalendarView.MONTH) listOf(anchor.toString()) else byDate.keys.toList()
        shownDays.forEach { day ->
            val dayBookings = byDate[day].orEmpty()
            item(key = "h$day") {
                Text(displayDate(day), fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = WorkColors.Ink)
            }
            if (dayBookings.isEmpty()) item(key = "e$day") { EmptyState("No bookings on this day.") }
            items(dayBookings, key = { it.id }) { booking -> BookingCard(booking, now, onClick = { onOpen(booking) }) }
        }
    }
}

@Composable
private fun CalendarDay(
    day: Int, isToday: Boolean, isSelected: Boolean, isPast: Boolean, statuses: List<String>,
    modifier: Modifier, onClick: () -> Unit
) {
    val shape = RoundedCornerShapeTariff
    Box(
        modifier.aspectRatio(1f).padding(2.dp)
            .background(if (isSelected) WorkColors.Blue else Color.Transparent, shape)
            .border(if (isToday && !isSelected) 1.dp else 0.dp, if (isToday && !isSelected) WorkColors.Blue else Color.Transparent, shape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(day.toString(), fontSize = 13.sp,
                color = when { isSelected -> Color.White; isPast -> Color(0xFFAAAAAA); else -> WorkColors.Ink },
                fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal)
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.height(6.dp)) {
                statuses.forEach { status ->
                    val dot = if (status == "CONFIRMED") WorkColors.DarkGreen else WorkColors.Brown
                    Box(Modifier.size(5.dp).background(if (isSelected) Color.White else dot, CircleShape))
                }
            }
        }
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).background(color, CircleShape))
        Text(" $label", fontSize = 11.sp, color = WorkColors.Muted)
    }
}

/** Full booking history with pagination (GET /bookings/history). */
@Composable
private fun BookingHistory(
    token: String, reloadKey: Int, now: Long, busy: Boolean,
    onError: (Exception) -> Unit, onOpen: (Booking) -> Unit, onPay: (Booking) -> Unit
) {
    var page by rememberSaveable { mutableIntStateOf(1) }
    var data by remember { mutableStateOf<BookingPage?>(null) }

    // Re-read every 15 s: payment callbacks and hold expiry change status on the server.
    LaunchedEffect(page, reloadKey) {
        while (true) {
            try { data = WorkApi.history(token, page, PAGE_SIZE) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { onError(e); return@LaunchedEffect }
            delay(15_000L)
        }
    }
    val bookings = data?.bookings.orEmpty()
    val total = data?.total ?: 0
    LazyColumn(
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (data == null) item { LinearProgressIndicator(Modifier.fillMaxWidth(), color = WorkColors.Blue) }
        if (data != null && bookings.isEmpty()) item { EmptyState("You have no bookings yet.") }
        items(bookings, key = { it.id }) { booking ->
            BookingCard(booking, now, onClick = { onOpen(booking) }, busy = busy, onPay = onPay)
        }
        if (total > PAGE_SIZE) item {
            val pages = (total + PAGE_SIZE - 1) / PAGE_SIZE
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { page-- }, enabled = page > 1) { Text("Previous") }
                Text("Page $page / $pages", fontSize = 12.sp)
                TextButton(onClick = { page++ }, enabled = page < pages) { Text("Next") }
            }
        }
    }
}

@Composable
private fun BookingCard(
    booking: Booking, now: Long, onClick: () -> Unit,
    busy: Boolean = false, onPay: ((Booking) -> Unit)? = null
) {
    val (pillBg, pillInk) = bookingStatusColors(booking.status)
    Surface(
        color = Color.White, shape = CardShape,
        modifier = Modifier.fillMaxWidth().border(1.dp, Color(0xFF777777), CardShape).clickable(onClick = onClick)
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(booking.workspaceName, color = WorkColors.Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                StatusPill(bookingStatusLabel(booking.status, booking.cancellationReason), pillBg, pillInk)
            }
            Spacer(Modifier.height(4.dp))
            Text("${displayDate(booking.date)} · ${booking.startTime}–${booking.endTime}", fontSize = 12.sp, color = WorkColors.Ink)
            if (booking.isRecurring) Text("Recurring booking", fontSize = 11.sp, color = WorkColors.Blue)
            Text("${booking.tariffName} · ₴${moneyLabel(booking.amount)}", fontSize = 13.sp, color = WorkColors.Ink, fontWeight = FontWeight.Medium)
            Text("Payment: ${paymentStatusLabel(booking.paymentStatus)}", fontSize = 12.sp,
                color = if (booking.paymentStatus == "REQUIRES_REVIEW") WorkColors.Red else WorkColors.Ink)
            if (booking.isAwaitingPayment) {
                val left = secondsUntil(booking.paymentDeadline, now)
                Text(if (left > 0) "Pay within ${countdown(left)}" else "Payment time is over — refreshing…",
                    fontSize = 12.sp, color = WorkColors.Brown, fontWeight = FontWeight.Medium)
                if (onPay != null && booking.canPay(now)) {
                    Spacer(Modifier.height(8.dp))
                    PrimaryButton(booking.payButtonLabel(), onClick = { onPay(booking) }, enabled = !busy)
                }
            }
            Text("Tap for details", fontSize = 10.sp, color = WorkColors.Muted, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

/** Booking details shown from the calendar or history. */
@Composable
private fun BookingDetailsDialog(booking: Booking, location: String?, now: Long, busy: Boolean, onPay: () -> Unit, onDismiss: () -> Unit) {
    val (pillBg, pillInk) = bookingStatusColors(booking.status)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(booking.workspaceName, fontWeight = FontWeight.ExtraBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                StatusPill(bookingStatusLabel(booking.status, booking.cancellationReason), pillBg, pillInk)
                InfoRow("Location", location?.takeIf { it.isNotBlank() } ?: "—")
                InfoRow("Date", displayDate(booking.date))
                InfoRow("Time", "${booking.startTime}–${booking.endTime}")
                InfoRow("Tariff", booking.tariffName)
                InfoRow("Total", "₴${moneyLabel(booking.amount)} ${booking.currency}")
                InfoRow("Payment", paymentStatusLabel(booking.paymentStatus))
                if (booking.isAwaitingPayment) {
                    val left = secondsUntil(booking.paymentDeadline, now)
                    InfoRow("Pay within", if (left > 0) countdown(left) else "expired")
                }
                if (booking.isRecurring) InfoRow("Type", "Recurring")
                InfoRow("Reservation ID", booking.reference.ifBlank { booking.id })
            }
        },
        confirmButton = {
            if (booking.canPay(now)) {
                Button(onClick = onPay, enabled = !busy, colors = ButtonDefaults.buttonColors(containerColor = WorkColors.Blue)) {
                    Text(booking.payButtonLabel())
                }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row {
        Text(label, fontSize = 12.sp, color = WorkColors.Muted, modifier = Modifier.width(84.dp))
        Text(value, fontSize = 13.sp, color = WorkColors.Ink, fontWeight = FontWeight.Medium)
    }
}

// ====================== Tariffs ======================

@Composable
internal fun TariffsTab(
    token: String, selectedSpace: Workspace?, date: String, start: String, end: String,
    onError: (Exception) -> Unit, onChooseSpace: () -> Unit, onSelect: (Tariff) -> Unit
) {
    var tariffs by remember { mutableStateOf<List<Tariff>?>(null) }
    LaunchedEffect(token) {
        try { tariffs = WorkApi.tariffs(token) }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { onError(e); tariffs = emptyList() }
    }
    LazyColumn(
        contentPadding = PaddingValues(horizontal = 22.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp)
    ) {
        item {
            ScreenTitle("Choose your plan", "Select a tariff for your workspace booking.")
            Spacer(Modifier.height(8.dp))
            if (selectedSpace != null) {
                Text("${selectedSpace.name} · ${displayDate(date)}, $start–$end", fontSize = 12.sp, color = WorkColors.Blue, fontWeight = FontWeight.Medium)
            } else {
                Text("Prices only. To book, choose a workspace first.", fontSize = 12.sp, color = WorkColors.Muted)
                TextButton(onClick = onChooseSpace, contentPadding = PaddingValues(0.dp)) { Text("Choose a workspace →", color = WorkColors.Blue) }
            }
        }
        val list = tariffs
        if (list == null) item { LinearProgressIndicator(Modifier.fillMaxWidth(), color = WorkColors.Blue) }
        else if (list.isEmpty()) item { EmptyState("No tariffs yet.") }
        else itemsIndexed(list) { index, tariff ->
            // Figma highlights the middle plan.
            TariffCard(tariff, featured = list.size >= 3 && index == 1 || list.size < 3 && index == 0,
                selectable = selectedSpace != null, onSelect = { onSelect(tariff) })
        }
    }
}

@Composable
private fun TariffCard(tariff: Tariff, featured: Boolean, selectable: Boolean, onSelect: () -> Unit) {
    val fg = if (featured) Color.White else WorkColors.Ink
    Surface(
        modifier = Modifier.fillMaxWidth().border(1.dp, WorkColors.TariffGreen, RoundedCornerShapeTariff),
        color = if (featured) WorkColors.TariffGreen else Color.White, shape = RoundedCornerShapeTariff
    ) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 18.dp)) {
            Text(tariff.name, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = fg)
            Row(verticalAlignment = Alignment.Bottom) {
                Text("₴${moneyLabel(tariff.price)}", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = fg)
                Text(" / booking", fontSize = 12.sp, color = if (featured) Color(0xFFD9D9D9) else WorkColors.Muted,
                    modifier = Modifier.padding(bottom = 5.dp))
            }
            HorizontalDivider(Modifier.padding(vertical = 12.dp), color = if (featured) Color.LightGray else Color(0xFFDDDDDD))
            Text("Fixed price for the selected time", color = if (featured) Color.White else Color.Gray, fontSize = 11.sp,
                modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            Spacer(Modifier.height(10.dp))
            SecondaryButton("Select tariff", onClick = onSelect, enabled = selectable, color = WorkColors.TariffGreen)
        }
    }
}

private val RoundedCornerShapeTariff = androidx.compose.foundation.shape.RoundedCornerShape(8.dp)

// ====================== Profile ======================

@Composable
internal fun ProfileTab(token: String, onError: (Exception) -> Unit, onLogout: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var user by remember { mutableStateOf<UserProfile?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf("") }
    var verificationUrl by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(reload) {
        try { user = WorkApi.me(token) }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { onError(e) }
    }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        ScreenTitle("My profile")
        Spacer(Modifier.height(20.dp))
        val profile = user
        if (profile == null) {
            LinearProgressIndicator(Modifier.fillMaxWidth(), color = WorkColors.Blue)
        } else {
            Surface(color = Color.White, shape = CardShape, modifier = Modifier.fillMaxWidth().border(1.dp, WorkColors.Ink, CardShape)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(profile.name, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = WorkColors.Ink)
                    Text(profile.email, fontSize = 13.sp, color = WorkColors.Ink)
                    Text("Role: client", fontSize = 12.sp, color = WorkColors.Muted)
                    Spacer(Modifier.height(6.dp))
                    if (profile.emailVerified) StatusPill("✓ Email verified", WorkColors.LightGreen, WorkColors.DarkGreen)
                    else StatusPill("Email not verified", WorkColors.LightRed, WorkColors.Red)
                }
            }
            if (!profile.emailVerified) {
                Spacer(Modifier.height(10.dp))
                Text("Confirm your email to create bookings.", fontSize = 12.sp, color = WorkColors.Brown)
                Spacer(Modifier.height(8.dp))
                SecondaryButton("Resend verification", enabled = !busy, onClick = {
                    busy = true
                    scope.launch {
                        try {
                            verificationUrl = WorkApi.resendVerification(profile.email)
                            info = if (verificationUrl != null) "Demo server: confirm your email with the button below."
                            else "Request sent. Check your inbox."
                        } catch (e: CancellationException) { throw e }
                        catch (e: Exception) { onError(e) }
                        finally { busy = false }
                    }
                })
                verificationUrl?.let { url ->
                    Spacer(Modifier.height(8.dp))
                    SecondaryButton("Open verification link (demo server)", onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    })
                }
                TextButton(onClick = { reload++ }) { Text("I've verified — check again", color = WorkColors.Blue) }
                if (info.isNotBlank()) Text(info, fontSize = 12.sp, color = WorkColors.DarkGreen)
            }
        }
        Spacer(Modifier.weight(1f))
        PrimaryButton("Log out", onClick = onLogout)
    }
}
