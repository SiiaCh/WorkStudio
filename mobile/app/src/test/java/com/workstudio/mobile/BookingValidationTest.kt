package com.workstudio.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

/** TC-03: client-side period validation. The backend remains authoritative. */
class BookingValidationTest {
    private val kyiv = ZoneId.of("Europe/Kyiv")
    private val now = ZonedDateTime.of(2026, 11, 16, 12, 0, 0, 0, kyiv)

    @Test
    fun futureIntervalIsValid() {
        assertNull(BookingValidation.message("2026-11-17", "10:00", "11:00", now))
    }

    @Test
    fun endBeforeStartIsRejected() {
        assertEquals("\"To\" must be later than \"From\".",
            BookingValidation.message("2026-11-17", "11:00", "10:00", now))
    }

    @Test
    fun equalStartAndEndIsRejected() {
        assertNotNull(BookingValidation.message("2026-11-17", "10:00", "10:00", now))
    }

    @Test
    fun pastStartIsRejected() {
        assertEquals("Choose a future date and time.",
            BookingValidation.message("2026-11-16", "09:00", "10:00", now))
    }

    @Test
    fun malformedValuesAreRejected() {
        assertNotNull(BookingValidation.message("2026-02-30", "10:00", "11:00", now))
        assertNotNull(BookingValidation.message("2026-11-17", "25:00", "11:00", now))
        assertNotNull(BookingValidation.message("2026-11-17", "10:00", "xx", now))
    }
}
