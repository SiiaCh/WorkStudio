package com.workstudio.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class FormattersTest {
    @Test
    fun moneyDropsZeroCents() {
        assertEquals("250", moneyLabel("250.00"))
        assertEquals("150.25", moneyLabel("150.25"))
    }

    @Test
    fun timeOptionsFollowOpeningHours() {
        val options = timeOptions(OpeningHours("09:00", "11:00"))
        assertEquals(listOf("09:00", "09:30", "10:00", "10:30", "11:00"), options)
        val rounded = timeOptions(OpeningHours("08:15", "09:00"))
        assertEquals(listOf("08:30", "09:00"), rounded)
        assertEquals("08:00", timeOptions(null).first())
        assertEquals("22:00", timeOptions(null).last())
    }

    @Test
    fun suggestedEndIsClippedToRange() {
        assertEquals("11:00", suggestedEnd(FreeRange("10:00", "14:00")))
        assertEquals("10:30", suggestedEnd(FreeRange("10:00", "10:30")))
    }

    @Test
    fun pendingPaymentIsNeverShownAsConfirmed() {
        val label = bookingStatusLabel("PENDING_PAYMENT", null)
        assertTrue(!label.contains("Confirmed"))
        assertEquals("Cancelled · not paid in time", bookingStatusLabel("CANCELLED", "PAYMENT_TIMEOUT"))
    }

    @Test
    fun weekdayKeyMatchesBackendSchedule() {
        assertEquals("MON", weekdayKey("2026-11-16"))
        assertEquals("SUN", weekdayKey("2026-11-22"))
    }

    @Test
    fun displayDateMarksTodayAndTomorrow() {
        val today = LocalDate.of(2026, 11, 16)
        assertEquals("Today, Mon, Nov 16", displayDate("2026-11-16", today))
        assertEquals("Tomorrow, Tue, Nov 17", displayDate("2026-11-17", today))
    }

    @Test
    fun countdownFormatsMinutes() {
        assertEquals("14:05", countdown(845))
        assertEquals(0L, secondsUntil(null, 0))
    }
}
