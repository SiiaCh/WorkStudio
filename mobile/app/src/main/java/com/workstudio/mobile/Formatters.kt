package com.workstudio.mobile

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The coworking facility timezone (backend FACILITY_TIME_ZONE). */
internal val FacilityZone: ZoneId = ZoneId.of("Europe/Kyiv")

private val weekdayKeys = listOf("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")

internal fun todayInFacility(): LocalDate = LocalDate.now(FacilityZone)

/** Backend schedule key (MON..SUN) for a local date. */
internal fun weekdayKey(date: String): String? = try {
    weekdayKeys[LocalDate.parse(date).dayOfWeek.value - 1]
} catch (_: Exception) { null }

/** "12.50" -> "12.50", "250.00" -> "250". */
internal fun moneyLabel(raw: String): String = raw.removeSuffix(".00").ifEmpty { "0" }

internal fun displayDate(raw: String, today: LocalDate = todayInFacility()): String = try {
    val chosen = LocalDate.parse(raw)
    val label = chosen.format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.ENGLISH))
    when (chosen) {
        today -> "Today, $label"
        today.plusDays(1) -> "Tomorrow, $label"
        else -> label
    }
} catch (_: Exception) { raw }

/** ISO instant -> facility-local HH:mm, or null. */
internal fun localClock(iso: String?): String? = try {
    if (iso.isNullOrBlank()) null else Instant.parse(iso).atZone(FacilityZone).format(DateTimeFormatter.ofPattern("HH:mm"))
} catch (_: Exception) { null }

internal fun secondsUntil(iso: String?, nowEpochSeconds: Long): Long = try {
    if (iso.isNullOrBlank()) 0L else (Instant.parse(iso).epochSecond - nowEpochSeconds).coerceAtLeast(0L)
} catch (_: Exception) { 0L }

internal fun countdown(seconds: Long): String = "%02d:%02d".format(seconds / 60, seconds % 60)

/** Half-hour options inside opening hours (08:00–22:00 when unknown). */
internal fun timeOptions(hours: OpeningHours?): List<String> {
    val open = runCatching { LocalTime.parse(hours?.open ?: "08:00") }.getOrDefault(LocalTime.of(8, 0))
    val close = runCatching { LocalTime.parse(hours?.close ?: "22:00") }.getOrDefault(LocalTime.of(22, 0))
    val result = mutableListOf<String>()
    var t = if (open.minute % 30 == 0) open else open.withMinute(if (open.minute < 30) 30 else 0).plusHours(if (open.minute < 30) 0 else 1)
    while (!t.isAfter(close)) {
        result += t.toString()
        if (t.hour == 23 && t.minute == 30) break
        t = t.plusMinutes(30)
    }
    return result
}

/** One hour after the range start, clipped to the range end. */
internal fun suggestedEnd(range: FreeRange): String = try {
    val from = LocalTime.parse(range.startTime)
    val limit = LocalTime.parse(range.endTime)
    val candidate = from.plusHours(1)
    (if (candidate.isAfter(limit) || candidate.isBefore(from)) limit else candidate).toString()
} catch (_: Exception) { range.endTime }

// ---------- status texts (PENDING_PAYMENT is never presented as confirmed) ----------

internal fun bookingStatusLabel(status: String, cancellationReason: String?): String = when (status) {
    "PENDING_PAYMENT" -> "Awaiting payment"
    "CONFIRMED" -> "Confirmed"
    "COMPLETED" -> "Completed"
    "CANCELLED" -> when (cancellationReason) {
        "PAYMENT_TIMEOUT" -> "Cancelled · not paid in time"
        "ADMINISTRATOR" -> "Cancelled by administrator"
        else -> "Cancelled"
    }
    else -> status
}

internal fun paymentStatusLabel(status: String?): String = when (status) {
    null -> "Not paid"
    "PENDING" -> "In progress — waiting for LiqPay result"
    "SUCCEEDED" -> "Paid"
    "FAILED" -> "Failed — you can retry before the deadline"
    "REQUIRES_REVIEW" -> "Under operator review"
    else -> status
}

/** Why a workspace is not free for the selected interval (availability unavailableReason). */
internal fun unavailableReasonLabel(reason: String?, status: String): String = when (reason) {
    "BOOKING_CONFLICT" -> "Already booked for this time"
    "WORKSPACE_OCCUPIED_NOW" -> "Occupied right now"
    "WORKSPACE_UNAVAILABLE" -> "Currently unavailable"
    "FACILITY_CLOSED" -> "Coworking is closed at this time"
    "INTERVAL_IN_PAST" -> "This time has already passed"
    else -> if (status == "UNAVAILABLE") "Currently unavailable" else "Not free for this time"
}

internal fun freeRangesEmptyLabel(reason: String?): String = when (reason) {
    "WORKSPACE_UNAVAILABLE" -> "This workspace is unavailable for booking."
    "FACILITY_CLOSED" -> "The coworking is closed on this date or no time remains today."
    "NO_AVAILABLE_RANGES" -> "No free time left on this date. Try another day."
    else -> "No free time ranges for this date."
}

// ---------- booking calendar periods (TC-13: Day / Week / Month) ----------

internal enum class CalendarView(val label: String) { DAY("Day"), WEEK("Week"), MONTH("Month") }

/** Inclusive date range shown for [view] around [anchor]; weeks start on Monday. */
internal fun calendarRange(view: CalendarView, anchor: LocalDate): Pair<LocalDate, LocalDate> = when (view) {
    CalendarView.DAY -> anchor to anchor
    CalendarView.WEEK -> anchor.minusDays(anchor.dayOfWeek.value - 1L).let { it to it.plusDays(6) }
    CalendarView.MONTH -> anchor.withDayOfMonth(1).let { it to it.plusMonths(1).minusDays(1) }
}

/** Moves [anchor] by [steps] periods of [view]. */
internal fun shiftPeriod(view: CalendarView, anchor: LocalDate, steps: Long): LocalDate = when (view) {
    CalendarView.DAY -> anchor.plusDays(steps)
    CalendarView.WEEK -> anchor.plusWeeks(steps)
    CalendarView.MONTH -> anchor.plusMonths(steps)
}

internal fun periodTitle(view: CalendarView, anchor: LocalDate): String {
    val (from, to) = calendarRange(view, anchor)
    return when (view) {
        CalendarView.DAY -> from.format(DateTimeFormatter.ofPattern("EEE, MMM d yyyy", Locale.ENGLISH))
        CalendarView.WEEK -> from.format(DateTimeFormatter.ofPattern("MMM d", Locale.ENGLISH)) + " – " +
            to.format(DateTimeFormatter.ofPattern("MMM d", Locale.ENGLISH))
        CalendarView.MONTH -> from.format(DateTimeFormatter.ofPattern("LLLL yyyy", Locale.ENGLISH))
    }
}
