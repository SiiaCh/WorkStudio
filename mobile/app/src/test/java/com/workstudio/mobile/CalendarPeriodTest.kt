package com.workstudio.mobile

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

/** TC-13: Day / Week / Month periods of the booking calendar. */
class CalendarPeriodTest {
    private val wednesday = LocalDate.of(2026, 11, 18)

    @Test
    fun dayViewIsSingleDay() {
        assertEquals(wednesday to wednesday, calendarRange(CalendarView.DAY, wednesday))
    }

    @Test
    fun weekViewStartsOnMonday() {
        assertEquals(LocalDate.of(2026, 11, 16) to LocalDate.of(2026, 11, 22), calendarRange(CalendarView.WEEK, wednesday))
    }

    @Test
    fun monthViewCoversWholeMonth() {
        assertEquals(LocalDate.of(2026, 11, 1) to LocalDate.of(2026, 11, 30), calendarRange(CalendarView.MONTH, wednesday))
        assertEquals(LocalDate.of(2028, 2, 29), calendarRange(CalendarView.MONTH, LocalDate.of(2028, 2, 10)).second)
    }

    @Test
    fun shiftMovesByOnePeriod() {
        assertEquals(LocalDate.of(2026, 11, 19), shiftPeriod(CalendarView.DAY, wednesday, 1))
        assertEquals(LocalDate.of(2026, 11, 25), shiftPeriod(CalendarView.WEEK, wednesday, 1))
        assertEquals(LocalDate.of(2026, 12, 18), shiftPeriod(CalendarView.MONTH, wednesday, 1))
    }

    @Test
    fun titles() {
        assertEquals("Nov 16 – Nov 22", periodTitle(CalendarView.WEEK, wednesday))
        assertEquals("November 2026", periodTitle(CalendarView.MONTH, wednesday))
    }
}
