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
            catch (_: Exception) { return "Оберіть правильну дату." }
        val fromTime = try { LocalTime.parse(from) }
            catch (_: Exception) { return "Оберіть правильний час початку." }
        val toTime = try { LocalTime.parse(to) }
            catch (_: Exception) { return "Оберіть правильний час завершення." }

        if (!toTime.isAfter(fromTime)) {
            return "Час To повинен бути пізніше за From."
        }
        val startsAt = LocalDateTime.of(selectedDate, fromTime).atZone(facilityZone)
        if (!startsAt.isAfter(now.withZoneSameInstant(facilityZone))) {
            return "Оберіть майбутню дату й час бронювання."
        }
        return null
    }
}
