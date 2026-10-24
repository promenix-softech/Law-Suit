package com.promenix.civilsuitsfield.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/** Promenix brand: navy, blue and sky from the logo, plus status accents. */
object Palette {
    val Night = Color(0xFF070F26)
    val Deep = Color(0xFF0E1A3A)
    val Navy = Color(0xFF0D2A6B)
    val Blue = Color(0xFF1D6FF2)
    val Royal = Color(0xFF1557D6)
    val Sky = Color(0xFF4FB3FF)
    val Mint = Color(0xFF2BD9A8)
    val Amber = Color(0xFFFFB547)
    val Coral = Color(0xFFFF6B6B)
    val Violet = Color(0xFF8B7CFF)
    val Text = Color(0xFFF2F6FF)
    val Muted = Color(0xFF9FB0D3)
    val Glass = Color(0x14FFFFFF)
    val GlassBorder = Color(0x26FFFFFF)
}

@Composable
fun PromenixTheme(content: @Composable () -> Unit) {
    val scheme = darkColorScheme(
        primary = Palette.Blue,
        onPrimary = Color.White,
        secondary = Palette.Sky,
        background = Palette.Night,
        onBackground = Palette.Text,
        surface = Palette.Deep,
        onSurface = Palette.Text,
        surfaceVariant = Color(0xFF16244A),
        onSurfaceVariant = Palette.Muted,
        error = Palette.Coral,
        outline = Palette.GlassBorder,
    )
    MaterialTheme(colorScheme = scheme, typography = Typography(), content = content)
}

val STATUSES = listOf("open", "in_progress", "done")

fun statusColor(status: String): Color = when (status) {
    "open" -> Palette.Sky
    "in_progress" -> Palette.Amber
    "done" -> Palette.Mint
    else -> Palette.Muted
}

fun statusLabel(status: String): String = when (status) {
    "open" -> "To do"
    "in_progress" -> "In progress"
    "done" -> "Done"
    "cancelled" -> "Cancelled"
    else -> status
}

fun kindLabel(kind: String): String = when (kind) {
    "collect_docs" -> "Collect documents"
    "notary" -> "Notary / stamp"
    "efile" -> "E-filing"
    "dispatch_notice" -> "Dispatch notice"
    "draft" -> "Drafting"
    "approve" -> "Approval"
    else -> kind
}

fun kindColor(kind: String): Color = when (kind) {
    "collect_docs" -> Palette.Sky
    "notary" -> Palette.Violet
    "efile" -> Palette.Blue
    "dispatch_notice" -> Palette.Amber
    else -> Palette.Mint
}

val IST: ZoneId = ZoneId.of("Asia/Kolkata")

fun todayIst(): LocalDate = LocalDate.now(IST)

/** "Due today", "Due in 3 days", "2 days overdue" from a timestamptz; null when there is no due date. */
fun dueText(dueAt: String?): Pair<String, Boolean>? {
    val due = runCatching { OffsetDateTime.parse(dueAt ?: return null).atZoneSameInstant(IST).toLocalDate() }.getOrNull() ?: return null
    val days = ChronoUnit.DAYS.between(todayIst(), due)
    return when {
        days < 0 -> "${-days} day${if (days == -1L) "" else "s"} overdue" to true
        days == 0L -> "Due today" to false
        days == 1L -> "Due tomorrow" to false
        else -> "Due in $days days" to false
    }
}

private val whenFormat = DateTimeFormatter.ofPattern("d MMM, h:mm a")
private val dayFormat = DateTimeFormatter.ofPattern("EEEE, d MMMM")

fun formatInstant(iso: String): String =
    runCatching { OffsetDateTime.parse(iso).atZoneSameInstant(IST).format(whenFormat) }.getOrDefault(iso)

fun formatDay(day: LocalDate): String = day.format(dayFormat)

fun formatDay(iso: String): String = runCatching { formatDay(LocalDate.parse(iso)) }.getOrDefault(iso)
