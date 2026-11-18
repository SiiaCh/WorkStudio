package com.workstudio.mobile

import android.app.DatePickerDialog
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import java.time.LocalDate
import java.time.ZoneId

private data class SpaceBadge(val label: String, val background: Color, val foreground: Color)

private fun Workspace.badge(): SpaceBadge = when {
    status == "UNAVAILABLE" -> SpaceBadge("Unavailable", WorkColors.LightRed, WorkColors.Red)
    available -> SpaceBadge("Free", WorkColors.LightGreen, WorkColors.DarkGreen)
    else -> SpaceBadge("Occupied", WorkColors.LightYellow, WorkColors.Brown)
}

/** Spaces tab (Figma "01 — Workspace List"). */
@Composable
internal fun SpacesTab(
    isGuest: Boolean, date: String, start: String, end: String,
    hours: OpeningHours?, closedDay: Boolean, intervalError: String?,
    availability: Availability?, error: String,
    onDate: (String) -> Unit, onStart: (String) -> Unit, onEnd: (String) -> Unit,
    onRefresh: () -> Unit, onLoginRequested: () -> Unit,
    onOpen: (Workspace) -> Unit, onBook: (Workspace) -> Unit
) {
    val context = LocalContext.current
    val workspaces = availability?.workspaces.orEmpty()
    val options = timeOptions(hours)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            ScreenTitle("Find a workspace", "Choose a place that works for you")
            if (isGuest) {
                Spacer(Modifier.height(6.dp))
                Surface(color = Color.White, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().border(1.dp, WorkColors.Blue, RoundedCornerShape(8.dp))) {
                    Row(Modifier.padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Guest mode — browse freely, sign in to book.", color = WorkColors.Blue, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        TextButton(onClick = onLoginRequested) { Text("Sign in", color = WorkColors.Blue, fontWeight = FontWeight.Bold) }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Text("Select date", fontWeight = FontWeight.Bold, color = WorkColors.Ink, fontSize = 12.sp)
            Spacer(Modifier.height(5.dp))
            OutlinedButton(
                onClick = {
                    val current = runCatching { LocalDate.parse(date) }.getOrDefault(todayInFacility())
                    DatePickerDialog(context, { _, year, month, day ->
                        onDate(LocalDate.of(year, month + 1, day).toString())
                    }, current.year, current.monthValue - 1, current.dayOfMonth).apply {
                        // Past dates are rejected by the API: block them in the picker.
                        datePicker.minDate = todayInFacility().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
                    }.show()
                },
                modifier = Modifier.fillMaxWidth().height(45.dp),
                shape = RoundedCornerShape(7.dp),
                border = BorderStroke(1.dp, WorkColors.Ink),
                colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White)
            ) {
                Text(displayDate(date), color = WorkColors.Ink, fontWeight = FontWeight.Medium, fontSize = 12.sp,
                    modifier = Modifier.weight(1f), textAlign = TextAlign.Start)
                WorkTabIcon(1, WorkColors.Ink)
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("From", fontSize = 11.sp, color = WorkColors.Ink)
                    TimePickerField(start, options, onStart)
                }
                Column(Modifier.weight(1f)) {
                    Text("To", fontSize = 11.sp, color = WorkColors.Ink)
                    TimePickerField(end, options, onEnd)
                }
            }
            if (hours != null) Text("Open ${hours.open}–${hours.close}", fontSize = 11.sp, color = WorkColors.Muted,
                modifier = Modifier.padding(top = 4.dp))
            if (closedDay) Text("The coworking is closed on this day.", fontSize = 12.sp, color = WorkColors.Brown,
                modifier = Modifier.padding(top = 4.dp))
            if (intervalError != null) {
                Spacer(Modifier.height(7.dp))
                Text(intervalError, color = WorkColors.Red, fontSize = 12.sp)
            }
            Spacer(Modifier.height(15.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Available workspaces", fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = WorkColors.Ink)
                    Text("Choose a workspace to continue", fontSize = 11.sp, color = WorkColors.Ink)
                }
                TextButton(onClick = onRefresh) { Text("Refresh", color = WorkColors.Blue, fontSize = 12.sp) }
            }
            if (error.isNotBlank()) Text(error, color = WorkColors.Red, fontSize = 12.sp)
        }
        when {
            intervalError != null -> {}
            availability == null && error.isBlank() -> item { LinearProgressIndicator(Modifier.fillMaxWidth(), color = WorkColors.Blue) }
            availability != null && workspaces.isEmpty() -> item { EmptyState("No workspaces yet.") }
            availability != null && workspaces.none { it.available } -> item {
                NoFreePlaces(availability.suggestedDates, onPick = onDate)
            }
        }
        items(workspaces, key = { it.id }) { space ->
            WorkspaceCard(space, start, end, onOpen = { onOpen(space) }, onBook = { onBook(space) }, isGuest = isGuest)
        }
    }
}

/** TC-02: nothing free — offer the nearest dates returned by the API. */
@Composable
private fun NoFreePlaces(suggestions: List<SuggestedDate>, onPick: (String) -> Unit) {
    Surface(color = WorkColors.LightYellow, shape = CardShape, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("No available workspaces for the selected time", color = WorkColors.Brown, fontWeight = FontWeight.Bold)
            if (suggestions.isEmpty()) {
                Text("Try another time or date.", fontSize = 12.sp, color = WorkColors.Brown)
            } else {
                Text("Nearest dates with free places for the same time:", fontSize = 12.sp, color = WorkColors.Ink)
                suggestions.forEach { suggestion ->
                    SecondaryButton(
                        displayDate(suggestion.date) +
                            if (suggestion.locations.isNotEmpty()) " · ${suggestion.locations.joinToString(", ")}" else "",
                        onClick = { onPick(suggestion.date) }
                    )
                }
            }
        }
    }
}

@Composable
private fun WorkspaceCard(space: Workspace, start: String, end: String, isGuest: Boolean, onOpen: () -> Unit, onBook: () -> Unit) {
    val badge = space.badge()
    val unavailable = space.status == "UNAVAILABLE"
    Surface(
        modifier = Modifier.fillMaxWidth().border(1.dp, WorkColors.Ink, CardShape).clickable(onClick = onOpen),
        shape = CardShape, color = Color.White
    ) {
        Column(Modifier.padding(13.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(space.name, color = WorkColors.Ink, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
                    Text(listOf(space.type, space.location).filter { it.isNotBlank() }.joinToString(" · "),
                        color = WorkColors.Ink, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                    if (space.description.isNotBlank()) Text(space.description, color = WorkColors.Muted, fontSize = 11.sp)
                }
                StatusPill(badge.label, badge.background, badge.foreground)
            }
            Spacer(Modifier.height(8.dp))
            val until = localClock(space.availableUntil)
            Text(
                when {
                    space.available && until != null -> "◷  Available until $until"
                    space.available -> "◷  Available for $start–$end"
                    else -> "◷  " + unavailableReasonLabel(space.unavailableReason, space.status)
                }, color = WorkColors.Ink, fontSize = 12.sp
            )
            Spacer(Modifier.height(9.dp))
            when {
                space.available -> PrimaryButton(if (isGuest) "Sign in to book" else "Book workspace", onClick = onBook)
                unavailable -> PrimaryButton("Unavailable", onClick = {}, enabled = false)
                // Occupied for this interval: show the free ranges of this workspace.
                else -> PrimaryButton("Choose another time", onClick = onOpen)
            }
        }
    }
}

@Composable
private fun TimePickerField(value: String, options: List<String>, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth().height(43.dp),
            border = BorderStroke(1.dp, Color(0xFF999999)),
            shape = RoundedCornerShape(7.dp),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White)
        ) { Text(value, color = WorkColors.Ink, fontSize = 12.sp) }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }, modifier = Modifier.heightIn(max = 320.dp)) {
            options.forEach { option ->
                val selected = option == value
                DropdownMenuItem(
                    text = {
                        Text(if (selected) "$option  ✓" else option,
                            color = if (selected) WorkColors.Blue else WorkColors.Ink,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
                    },
                    onClick = { onSelect(option); expanded = false }
                )
            }
        }
    }
}

/** Client workspace details (Figma "Workspace 01" without administrator actions) + free ranges. */
@Composable
internal fun WorkspaceDetailsScreen(
    workspaceId: String, workspace: Workspace?, date: String, start: String, end: String,
    intervalError: String?, isGuest: Boolean, notice: String, onDismissNotice: () -> Unit,
    onBack: () -> Unit, onPickRange: (FreeRange) -> Unit, onBook: (Workspace) -> Unit
) {
    var slots by remember { mutableStateOf<WorkspaceSlots?>(null) }
    var slotsError by remember { mutableStateOf("") }

    // GET /workspaces/:id/available-slots, refreshed while the screen is open.
    LaunchedEffect(workspaceId, date) {
        slots = null
        slotsError = ""
        while (true) {
            try {
                slots = WorkApi.availableSlots(workspaceId, date)
                slotsError = ""
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { slotsError = e.userMessage() }
            delay(3_000L)
        }
    }

    Column(Modifier.fillMaxSize().background(WorkColors.Background)) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onBack, contentPadding = PaddingValues(0.dp)) {
                        Text("←", fontSize = 22.sp, color = WorkColors.Ink, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(6.dp))
                    Text(workspace?.name ?: "Workspace", fontSize = 21.sp, color = WorkColors.Ink, fontWeight = FontWeight.ExtraBold)
                }
            }
            if (workspace == null) item { LinearProgressIndicator(Modifier.fillMaxWidth(), color = WorkColors.Blue) }
            workspace?.let { space ->
                item {
                    Surface(color = Color.White, shape = CardShape, modifier = Modifier.fillMaxWidth().border(1.dp, WorkColors.Ink, CardShape)) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            DetailRow("Type", space.type)
                            DetailRow("Zone", space.location)
                            DetailRow("Features", space.description)
                        }
                    }
                }
                item {
                    val badge = space.badge()
                    val until = localClock(space.availableUntil)
                    Surface(color = badge.background, shape = CardShape,
                        modifier = Modifier.fillMaxWidth().border(1.dp, badge.foreground, CardShape)) {
                        Column(Modifier.padding(14.dp)) {
                            Text(badge.label, color = badge.foreground, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                            Text(
                                when {
                                    intervalError != null -> intervalError
                                    space.available && until != null -> "${displayDate(date)}, $start–$end · available until $until"
                                    space.available -> "${displayDate(date)}, $start–$end"
                                    else -> unavailableReasonLabel(space.unavailableReason, space.status) + ". Pick a free range below."
                                }, color = badge.foreground, fontSize = 12.sp
                            )
                        }
                    }
                }
            }
            item {
                Text("Free time on ${displayDate(date)}", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = WorkColors.Ink)
                slots?.openingHours?.let { Text("Opening hours: ${it.open}–${it.close}", fontSize = 11.sp, color = WorkColors.Muted) }
                Spacer(Modifier.height(6.dp))
                val current = slots
                when {
                    current == null && slotsError.isNotBlank() -> Text(slotsError, color = WorkColors.Red, fontSize = 12.sp)
                    current == null -> LinearProgressIndicator(Modifier.fillMaxWidth(), color = WorkColors.Blue)
                    current.ranges.isEmpty() -> Text(freeRangesEmptyLabel(current.unavailableReason), color = WorkColors.Brown, fontSize = 12.sp)
                    else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Tap a range to use it as From / To:", fontSize = 11.sp, color = WorkColors.Ink)
                        current.ranges.forEach { range ->
                            SecondaryButton("${range.startTime} – ${range.endTime}", onClick = { onPickRange(range) }, color = WorkColors.DarkGreen)
                        }
                    }
                }
            }
        }
        MessageBanner(notice, true, onDismissNotice)
        val canBook = workspace != null && workspace.available && intervalError == null
        PrimaryButton(
            text = when {
                !canBook -> "Choose a free time first"
                isGuest -> "Sign in to book"
                else -> "Book for $start–$end"
            },
            enabled = canBook,
            onClick = { workspace?.let(onBook) },
            modifier = Modifier.navigationBarsPadding().padding(18.dp)
        )
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row {
        Text(label, fontSize = 12.sp, color = WorkColors.Muted, modifier = Modifier.width(78.dp))
        Text(value.ifBlank { "—" }, fontSize = 13.sp, color = WorkColors.Ink, fontWeight = FontWeight.Medium)
    }
}
