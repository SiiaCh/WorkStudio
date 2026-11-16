package com.workstudio.mobile

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/** Validation for the coworking facility's local date and time. Server remains authoritative. */
internal object BookingValidation {
    private val facilityZone = ZoneId.of("Europe/Kyiv")

    fun message(date: String, from: String, to: String,
                now: ZonedDateTime = ZonedDateTime.now(facilityZone)): String? {
        val selectedDate = try { LocalDate.parse(date) }
            catch (_: Exception) { return "Choose a valid date." }
        val fromTime = try { LocalTime.parse(from) }
            catch (_: Exception) { return "Choose a valid start time." }
        val toTime = try { LocalTime.parse(to) }
            catch (_: Exception) { return "Choose a valid end time." }

        if (!toTime.isAfter(fromTime)) {
            return "\"To\" must be later than \"From\"."
        }
        val startsAt = LocalDateTime.of(selectedDate, fromTime).atZone(facilityZone)
        if (!startsAt.isAfter(now.withZoneSameInstant(facilityZone))) {
            return "Choose a future date and time."
        }
        return null
    }
}
