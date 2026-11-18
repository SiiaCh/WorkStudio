package com.workstudio.mobile

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

private val tabNames = listOf("Spaces", "Booking", "Tariffs", "Profile")
private const val TAB_SPACES = 0
private const val TAB_BOOKINGS = 1
private const val TAB_TARIFFS = 2
private const val TAB_PROFILE = 3

/** Errors after which the user must go back and choose another place/time (TC-03, TC-04). */
private val selectionErrors = setOf(
    "BOOKING_CONFLICT", "WORKSPACE_OCCUPIED_NOW", "WORKSPACE_UNAVAILABLE", "OUTSIDE_OPENING_HOURS",
    "INVALID_INTERVAL", "INVALID_LOCAL_TIME", "BOOKING_IN_PAST", "DATE_IN_PAST", "WORKSPACE_NOT_FOUND"
)

private data class Notice(val text: String, val isError: Boolean)

/**
 * Client area: Spaces / Booking / Tariffs / Profile. [token] == null means guest mode (browse only).
 * The backend is authoritative for availability, prices, booking and payment status.
 */
@Composable
internal fun ClientHome(
    token: String?,
    onSessionExpired: () -> Unit,
    onLogout: () -> Unit,
    onLoginRequested: () -> Unit
) {
    val isGuest = token == null
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var tab by rememberSaveable { mutableIntStateOf(TAB_SPACES) }
    var date by rememberSaveable { mutableStateOf(todayInFacility().plusDays(1).toString()) }
    var start by rememberSaveable { mutableStateOf("10:00") }
    var end by rememberSaveable { mutableStateOf("11:00") }
    var detailsId by rememberSaveable { mutableStateOf<String?>(null) }

    var availability by remember { mutableStateOf<Availability?>(null) }
    var schedule by remember { mutableStateOf<Map<String, OpeningHours?>>(emptyMap()) }
    /** workspaceId -> location, used by booking details (the booking API returns only the workspace name). */
    var locations by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var spacesError by remember { mutableStateOf("") }
    var spacesRefresh by remember { mutableIntStateOf(0) }
    var bookingsRefresh by remember { mutableIntStateOf(0) }

    var selectedSpace by remember { mutableStateOf<Workspace?>(null) }
    var confirmTariff by remember { mutableStateOf<Tariff?>(null) }
    var payFor by remember { mutableStateOf<Booking?>(null) }
    var hostedCheckout by remember { mutableStateOf<LiqPayCheckout?>(null) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<Notice?>(null) }

    val intervalError = BookingValidation.message(date, start, end)
    val dayKey = weekdayKey(date)

    fun fail(error: Exception) {
        if (error.isUnauthenticated && !isGuest) onSessionExpired() else notice = Notice(error.userMessage(), true)
    }

    // The previous choice is invalid as soon as the interval changes.
    LaunchedEffect(date, start, end) {
        selectedSpace = null
        confirmTariff = null
    }

    // Live availability (TC-01): poll while Spaces is visible; errors never stop the loop.
    LaunchedEffect(tab, date, start, end, spacesRefresh) {
        if (tab != TAB_SPACES) return@LaunchedEffect
        availability = null
        spacesError = ""
        if (BookingValidation.message(date, start, end) != null) return@LaunchedEffect
        while (true) {
            val pause = try {
                val result = WorkApi.availability(date, start, end)
                availability = result
                schedule = result.openingHours
                locations = locations + result.workspaces.associate { it.id to it.location }
                spacesError = ""
                result.pollIntervalMs
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                spacesError = e.userMessage()
                4_000L
            }
            delay(pause)
        }
    }

    BackHandler(enabled = detailsId != null) { detailsId = null }
    BackHandler(enabled = detailsId == null && tab != TAB_SPACES) { tab = TAB_SPACES }

    // Provider-hosted LiqPay page. Returning from it is NOT proof of payment: we only refresh server state.
    hostedCheckout?.let { checkout ->
        LiqPayCheckoutScreen(checkout = checkout, onClose = {
            hostedCheckout = null
            tab = TAB_BOOKINGS
            bookingsRefresh++
            notice = Notice("Checking the payment status on the server. It updates after LiqPay responds.", false)
        })
        return
    }

    val openedId = detailsId
    if (openedId != null) {
        val space = availability?.workspaces?.firstOrNull { it.id == openedId }
        WorkspaceDetailsScreen(
            workspaceId = openedId, workspace = space, date = date, start = start, end = end,
            intervalError = intervalError, isGuest = isGuest,
            notice = notice?.text.orEmpty(), onDismissNotice = { notice = null },
            onBack = { detailsId = null },
            onPickRange = { range -> start = range.startTime; end = suggestedEnd(range) },
            onBook = { chosen ->
                if (isGuest) onLoginRequested()
                else { selectedSpace = chosen; detailsId = null; tab = TAB_TARIFFS }
            }
        )
        return
    }

    Column(Modifier.fillMaxSize().background(WorkColors.Background)) {
        Box(Modifier.weight(1f)) {
            when (tab) {
                TAB_SPACES -> SpacesTab(
                    isGuest = isGuest, date = date, start = start, end = end,
                    hours = dayKey?.let { schedule[it] }, closedDay = dayKey != null && schedule.containsKey(dayKey) && schedule[dayKey] == null,
                    intervalError = intervalError, availability = availability, error = spacesError,
                    onDate = { date = it }, onStart = { start = it }, onEnd = { end = it },
                    onRefresh = { spacesRefresh++ },
                    onLoginRequested = onLoginRequested,
                    onOpen = { detailsId = it.id },
                    onBook = { space ->
                        if (isGuest) onLoginRequested() else { selectedSpace = space; tab = TAB_TARIFFS }
                    }
                )
                TAB_BOOKINGS -> BookingsTab(
                    token = token.orEmpty(), refreshKey = bookingsRefresh, busy = busy, locations = locations,
                    onError = ::fail, onPay = { payFor = it }, onBookNew = { tab = TAB_SPACES; notice = null }
                )
                TAB_TARIFFS -> TariffsTab(
                    token = token.orEmpty(), selectedSpace = selectedSpace, date = date, start = start, end = end,
                    onError = ::fail,
                    onChooseSpace = { tab = TAB_SPACES },
                    onSelect = { tariff -> confirmTariff = tariff }
                )
                else -> ProfileTab(token = token.orEmpty(), onError = ::fail, onLogout = onLogout)
            }
        }
        notice?.let { MessageBanner(it.text, it.isError) { notice = null } }
        HorizontalDivider(color = Color(0xFFCCCCCC), thickness = 1.dp)
        Row(
            Modifier.fillMaxWidth().background(Color.White).navigationBarsPadding().height(62.dp),
            horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically
        ) {
            tabNames.forEachIndexed { index, name ->
                val selected = tab == index
                Column(
                    Modifier.weight(1f).fillMaxHeight().clickable {
                        when {
                            isGuest && index != TAB_SPACES -> onLoginRequested()
                            !selected -> { tab = index; notice = null }
                        }
                    },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically)
                ) {
                    WorkTabIcon(index, if (selected) WorkColors.Blue else WorkColors.Ink)
                    Text(name, fontSize = 10.sp, color = if (selected) WorkColors.Blue else WorkColors.Ink, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }

    // ---------- booking confirmation (TC-03 / TC-04) ----------
    confirmTariff?.let { tariff ->
        val space = selectedSpace
        AlertDialog(
            onDismissRequest = { if (!busy) confirmTariff = null },
            title = { Text("Confirm booking") },
            text = {
                Text("${space?.name.orEmpty()}\n${displayDate(date)} · $start–$end\nTariff: ${tariff.name}\n" +
                    "Total: ₴${moneyLabel(tariff.price)}\n\n" +
                    "The workspace will be held as \"Awaiting payment\". If it is not paid before the deadline, the hold is cancelled.")
            },
            confirmButton = {
                Button(
                    enabled = !busy && space != null,
                    colors = ButtonDefaults.buttonColors(containerColor = WorkColors.Blue),
                    onClick = {
                        val chosen = space ?: return@Button
                        val problem = BookingValidation.message(date, start, end)
                        if (problem != null) {
                            notice = Notice(problem, true); confirmTariff = null; tab = TAB_SPACES
                            return@Button
                        }
                        busy = true
                        scope.launch {
                            try {
                                // Server rechecks the interval atomically and snapshots the trusted price.
                                val booking = WorkApi.createBooking(token.orEmpty(), chosen.id, tariff.id, date, start, end)
                                selectedSpace = null
                                tab = TAB_BOOKINGS
                                bookingsRefresh++
                                notice = Notice("Workspace reserved (ref. ${booking.reference.take(8).uppercase()}) — " +
                                    "awaiting payment before the deadline.", false)
                                if (booking.isAwaitingPayment && booking.paymentIntegrationAvailable) payFor = booking
                            } catch (e: CancellationException) { throw e }
                            catch (e: Exception) {
                                fail(e)
                                if (e is StudioApi.ApiException && e.code in selectionErrors) {
                                    // Someone else took the slot: back to the selection with fresh data.
                                    selectedSpace = null
                                    tab = TAB_SPACES
                                    spacesRefresh++
                                }
                            } finally {
                                busy = false
                                confirmTariff = null
                            }
                        }
                    }
                ) { Text("Confirm") }
            },
            dismissButton = { TextButton(onClick = { confirmTariff = null }, enabled = !busy) { Text("Back") } }
        )
    }

    // ---------- payment (LiqPay test checkout or the development mock) ----------
    payFor?.let { booking ->
        val mock = booking.paymentProvider == "MOCK"
        AlertDialog(
            onDismissRequest = { if (!busy) payFor = null },
            title = { Text(if (mock) "Test payment (mock)" else "Pay with LiqPay (test mode)") },
            text = {
                Text("${booking.workspaceName}\n${displayDate(booking.date)} · ${booking.startTime}–${booking.endTime}\n" +
                    "Amount: ₴${moneyLabel(booking.amount)}\n\n" +
                    if (mock) "Simulation on the development server: no money is charged."
                    else "The secure LiqPay page will open. Card details are entered only there. " +
                        "The booking becomes Confirmed only after the server receives LiqPay's confirmation.")
            },
            confirmButton = {
                Button(
                    enabled = !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = WorkColors.Blue),
                    onClick = {
                        busy = true
                        scope.launch {
                            try {
                                if (mock) {
                                    val status = WorkApi.mockPayment(token.orEmpty(), booking.id, "success", UUID.randomUUID().toString())
                                    notice = Notice("Test payment: $status", status != "SUCCEEDED")
                                    bookingsRefresh++
                                } else {
                                    // Reuse the key only while an attempt is pending; otherwise start a new attempt.
                                    val key = LiqPayOperationStore.getOrCreate(
                                        context, booking.id, retryFailed = booking.paymentStatus != "PENDING"
                                    )
                                    hostedCheckout = WorkApi.startLiqPay(token.orEmpty(), booking.id, key)
                                    notice = null
                                }
                            } catch (e: CancellationException) { throw e }
                            catch (e: Exception) { fail(e); bookingsRefresh++ }
                            finally { busy = false; payFor = null }
                        }
                    }
                ) { Text(if (mock) "Simulate success" else "Continue to LiqPay") }
            },
            dismissButton = { TextButton(onClick = { payFor = null }, enabled = !busy) { Text("Later") } }
        )
    }
}
