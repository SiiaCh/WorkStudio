package com.workstudio.mobile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** WorkStudio palette from the Figma file. */
internal object WorkColors {
    val Blue = Color(0xFF2E619C)
    val DarkGreen = Color(0xFF166534)
    val LightGreen = Color(0xFF9CDF9E)
    val Red = Color(0xFFAF2626)
    val LightRed = Color(0xFFFEC7C7)
    val Brown = Color(0xFF92400E)
    val LightYellow = Color(0xFFFEF3C7)
    val TariffGreen = Color(0xFF364D37)
    val Ink = Color(0xFF151515)
    val Muted = Color(0xFF5F6368)
    val Background = Color(0xFFF7F8FA)
    val Disabled = Color(0xFFCECECE)
    val Grey = Color(0xFFE5E7EB)
}

internal val CardShape = RoundedCornerShape(9.dp)
internal val ButtonShape = RoundedCornerShape(6.dp)

@Composable
internal fun WorkStudioTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = WorkColors.Blue,
            onPrimary = Color.White,
            secondary = WorkColors.DarkGreen,
            error = WorkColors.Red,
            background = WorkColors.Background,
            surface = Color.White,
            onSurface = WorkColors.Ink,
            onBackground = WorkColors.Ink
        ),
        content = content
    )
}

@Composable
internal fun ScreenTitle(title: String, subtitle: String? = null) {
    Text(title, fontSize = 23.sp, color = WorkColors.Ink, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp)
    if (subtitle != null) Text(subtitle, fontSize = 12.sp, color = WorkColors.Ink, fontWeight = FontWeight.Medium)
}

@Composable
internal fun PrimaryButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false
) {
    Button(
        onClick = onClick, enabled = enabled && !loading, shape = ButtonShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = WorkColors.Blue,
            disabledContainerColor = WorkColors.Disabled, disabledContentColor = Color.Gray
        ),
        modifier = modifier.fillMaxWidth().height(48.dp)
    ) {
        if (loading) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
        else Text(text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
internal fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, color: Color = WorkColors.Blue) {
    OutlinedButton(
        onClick = onClick, enabled = enabled, shape = ButtonShape,
        border = BorderStroke(1.dp, if (enabled) color else WorkColors.Disabled),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White),
        modifier = modifier.fillMaxWidth().height(44.dp)
    ) { Text(text, color = if (enabled) color else Color.Gray, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
}

@Composable
internal fun StatusPill(label: String, background: Color, foreground: Color) {
    Surface(color = background, shape = RoundedCornerShape(10.dp)) {
        Text(label, modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp), color = foreground,
            fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

internal fun bookingStatusColors(status: String): Pair<Color, Color> = when (status) {
    "CONFIRMED" -> WorkColors.LightGreen to WorkColors.DarkGreen
    "PENDING_PAYMENT" -> WorkColors.LightYellow to WorkColors.Brown
    "CANCELLED" -> WorkColors.LightRed to WorkColors.Red
    else -> WorkColors.Grey to WorkColors.Ink
}

/** Inline error / info banner with a dismiss action. */
@Composable
internal fun MessageBanner(text: String, isError: Boolean = true, onDismiss: (() -> Unit)? = null) {
    if (text.isBlank()) return
    Surface(
        color = if (isError) WorkColors.LightRed else WorkColors.LightGreen,
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Row(Modifier.padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, Modifier.weight(1f).padding(vertical = 10.dp), fontSize = 12.sp,
                color = if (isError) WorkColors.Red else WorkColors.DarkGreen)
            if (onDismiss != null) TextButton(onClick = onDismiss) {
                Text("OK", color = if (isError) WorkColors.Red else WorkColors.DarkGreen, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
internal fun EmptyState(text: String) {
    Text(text, color = WorkColors.Muted, fontSize = 13.sp, textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp))
}

/** Bottom-bar icons drawn with Canvas to match Figma without an icon dependency. */
@Composable
internal fun WorkTabIcon(index: Int, tint: Color) {
    Canvas(Modifier.size(24.dp)) {
        val scale = size.width / 24f
        val line = 1.6.dp.toPx()
        fun at(x: Float, y: Float) = Offset(x * scale, y * scale)
        fun outline(x: Float, y: Float, w: Float, h: Float, radius: Float = 1.4f) = drawRoundRect(
            color = tint, topLeft = at(x, y), size = Size(w * scale, h * scale),
            cornerRadius = CornerRadius(radius * scale), style = Stroke(width = line)
        )
        fun rule(x1: Float, y1: Float, x2: Float, y2: Float) = drawLine(tint, at(x1, y1), at(x2, y2), strokeWidth = line)
        when (index) {
            0 -> { outline(3f, 3f, 7f, 7f); outline(14f, 3f, 7f, 7f); outline(3f, 14f, 7f, 7f); outline(14f, 14f, 7f, 7f) }
            1 -> { outline(3f, 5f, 18f, 16f, 2f); rule(3f, 10f, 21f, 10f); rule(8f, 2.5f, 8f, 7.5f); rule(16f, 2.5f, 16f, 7.5f) }
            2 -> {
                outline(3f, 7f, 18f, 14f, 2f); outline(14f, 12f, 9f, 6f, 1.5f); rule(6f, 7f, 18f, 3f)
                drawCircle(tint, radius = 1f * scale, center = at(17f, 15f))
            }
            else -> {
                drawCircle(tint, radius = 9f * scale, center = at(12f, 12f), style = Stroke(line))
                drawCircle(tint, radius = 3.1f * scale, center = at(12f, 9f), style = Stroke(line))
                drawArc(tint, 200f, 140f, false, topLeft = at(6f, 14f), size = Size(12f * scale, 7f * scale), style = Stroke(line))
            }
        }
    }
}
