package com.promenix.tasks.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.promenix.tasks.R
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random

/** Night background with slowly drifting brand-colour glows. */
@Composable
fun AuroraBackground(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val drift = rememberInfiniteTransition(label = "aurora")
    val a by drift.animateFloat(0f, 1f, infiniteRepeatable(tween(9000, easing = LinearEasing), RepeatMode.Reverse), label = "a")
    val b by drift.animateFloat(0f, 1f, infiniteRepeatable(tween(13000, easing = LinearEasing), RepeatMode.Reverse), label = "b")
    val c by drift.animateFloat(0f, 1f, infiniteRepeatable(tween(17000, easing = LinearEasing), RepeatMode.Reverse), label = "c")
    Box(
        modifier
            .fillMaxSize()
            .background(Palette.Night)
            .drawBehind {
                val w = size.width
                val h = size.height
                fun glow(color: Color, center: Offset, radius: Float) = drawCircle(
                    brush = Brush.radialGradient(listOf(color, Color.Transparent), center = center, radius = radius),
                    radius = radius,
                    center = center,
                )
                glow(Palette.Blue.copy(alpha = 0.42f), Offset(w * (0.1f + 0.6f * a), h * (0.12f + 0.08f * b)), w * 0.8f)
                glow(Palette.Sky.copy(alpha = 0.22f), Offset(w * (0.9f - 0.5f * b), h * (0.55f + 0.1f * c)), w * 0.7f)
                glow(Palette.Violet.copy(alpha = 0.18f), Offset(w * (0.2f + 0.5f * c), h * (0.92f - 0.1f * a)), w * 0.75f)
            },
        content = content,
    )
}

@Composable
fun GlassCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier
            .clip(shape)
            .background(Palette.Glass)
            .border(1.dp, Palette.GlassBorder, shape),
        content = content,
    )
}

/** Click with a springy press-down scale instead of the default ripple. */
fun Modifier.pressClick(enabled: Boolean = true, onClick: () -> Unit): Modifier = composed {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.96f else 1f, spring(dampingRatio = 0.5f, stiffness = 600f), label = "press")
    this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
        }
        .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick)
}

@Composable
fun GradientButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    loading: Boolean = false,
    enabled: Boolean = true,
    colors: List<Color> = listOf(Palette.Royal, Palette.Sky),
) {
    val fade by animateFloatAsState(if (enabled) 1f else 0.45f, label = "enabled")
    Box(
        modifier
            .graphicsLayer { alpha = fade }
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.horizontalGradient(colors))
            .pressClick(enabled = enabled && !loading, onClick = onClick)
            .padding(vertical = 15.dp, horizontal = 20.dp),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(
            targetState = loading,
            transitionSpec = { fadeIn(tween(180)) togetherWith fadeOut(tween(180)) },
            label = "button",
        ) { busy ->
            if (busy) {
                CircularProgressIndicator(Modifier.size(22.dp), color = Color.White, strokeWidth = 2.5.dp)
            } else {
                Text(text, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            }
        }
    }
}

@Composable
fun GhostButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, color: Color = Palette.Text, enabled: Boolean = true) {
    val shape = RoundedCornerShape(18.dp)
    Box(
        modifier
            .clip(shape)
            .border(1.dp, color.copy(alpha = 0.45f), shape)
            .background(color.copy(alpha = 0.06f))
            .pressClick(enabled = enabled, onClick = onClick)
            .padding(vertical = 14.dp, horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = color, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
    }
}

@Composable
fun Field(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    onDone: () -> Unit = {},
    password: Boolean = false,
    showPassword: Boolean = false,
    minLines: Int = 1,
    maxLength: Int = 1000,
    trailing: (@Composable () -> Unit)? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(it.take(maxLength)) },
        label = { Text(label) },
        modifier = modifier.fillMaxWidth(),
        singleLine = minLines == 1,
        minLines = minLines,
        shape = RoundedCornerShape(14.dp),
        visualTransformation = if (password && !showPassword) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
        keyboardActions = KeyboardActions(onDone = { onDone() }),
        trailingIcon = trailing,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Palette.Sky,
            unfocusedBorderColor = Palette.GlassBorder,
            focusedLabelColor = Palette.Sky,
            unfocusedLabelColor = Palette.Muted,
            cursorColor = Palette.Sky,
            focusedTextColor = Palette.Text,
            unfocusedTextColor = Palette.Text,
            focusedContainerColor = Color(0x0FFFFFFF),
            unfocusedContainerColor = Color(0x08FFFFFF),
        ),
    )
}

@Composable
fun Tag(text: String, color: Color) {
    Text(
        text,
        color = color,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.14f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
fun StatusPill(status: String) {
    val color by animateColorAsState(statusColor(status), tween(450), label = "pill")
    Row(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.16f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        AnimatedContent(
            targetState = statusLabel(status),
            transitionSpec = { (slideInVertically { it } + fadeIn()) togetherWith (slideOutVertically { -it } + fadeOut()) },
            label = "pill-text",
        ) { label ->
            Text(label, color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun ProgressRing(fraction: Float, modifier: Modifier = Modifier, diameter: Dp = 86.dp, stroke: Dp = 9.dp) {
    val animated by animateFloatAsState(fraction.coerceIn(0f, 1f), tween(1300, easing = FastOutSlowInEasing), label = "ring")
    Box(modifier.size(diameter), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val px = stroke.toPx()
            val topLeft = Offset(px / 2, px / 2)
            val arc = Size(size.width - px, size.height - px)
            drawArc(Color.White.copy(alpha = 0.08f), -90f, 360f, false, topLeft, arc, style = Stroke(px, cap = StrokeCap.Round))
            drawArc(
                brush = Brush.sweepGradient(listOf(Palette.Sky, Palette.Mint, Palette.Sky)),
                startAngle = -90f,
                sweepAngle = 360f * animated,
                useCenter = false,
                topLeft = topLeft,
                size = arc,
                style = Stroke(px, cap = StrokeCap.Round),
            )
        }
        Text("${(animated * 100).roundToInt()}%", color = Palette.Text, fontWeight = FontWeight.Bold, fontSize = 18.sp)
    }
}

@Composable
fun AnimatedCount(value: Int, color: Color, label: String, modifier: Modifier = Modifier) {
    val shown by animateIntAsState(value, tween(900, easing = FastOutSlowInEasing), label = "count")
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(shown.toString(), color = color, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Text(label, color = Palette.Muted, fontSize = 11.sp)
    }
}

/** Brand mark: the Promenix "P" in a breathing gradient disc with a spinning halo. */
@Composable
fun LogoMark(diameter: Dp = 96.dp, modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "logo")
    val breathe by t.animateFloat(0.92f, 1.04f, infiniteRepeatable(tween(1600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "breathe")
    val spin by t.animateFloat(0f, 360f, infiniteRepeatable(tween(5200, easing = LinearEasing)), label = "spin")
    Box(modifier.size(diameter), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize().graphicsLayer { rotationZ = spin }) {
            val px = 3.dp.toPx()
            drawCircle(
                brush = Brush.sweepGradient(listOf(Palette.Sky, Color.Transparent, Palette.Blue, Color.Transparent, Palette.Sky)),
                radius = size.minDimension / 2 - px,
                style = Stroke(px),
            )
        }
        Box(
            Modifier
                .size(diameter * 0.8f)
                .graphicsLayer {
                    scaleX = breathe
                    scaleY = breathe
                }
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(Palette.Sky, Palette.Blue, Palette.Royal))),
            contentAlignment = Alignment.Center,
        ) {
            Image(painterResource(R.drawable.ic_launcher_foreground), contentDescription = "Promenix", modifier = Modifier.fillMaxSize())
        }
    }
}

/** Fades and lifts its content in, [index] steps after the screen appears. */
@Composable
fun StaggerIn(index: Int, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(min(index, 10) * 55L)
        progress.animateTo(1f, spring(dampingRatio = 0.78f, stiffness = 220f))
    }
    Box(
        modifier.graphicsLayer {
            alpha = progress.value.coerceIn(0f, 1f)
            translationY = (1f - progress.value) * 70f
            val s = 0.94f + 0.06f * progress.value
            scaleX = s
            scaleY = s
        },
    ) { content() }
}

@Composable
fun Reveal(visible: Boolean, content: @Composable () -> Unit) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(520)) + slideInVertically(tween(520, easing = FastOutSlowInEasing)) { it / 3 },
    ) { content() }
}

/** Shimmering placeholder card while tasks load. */
@Composable
fun ShimmerCard() {
    val t = rememberInfiniteTransition(label = "shimmer")
    val x by t.animateFloat(-1f, 2f, infiniteRepeatable(tween(1300, easing = LinearEasing)), label = "x")
    Box(
        Modifier
            .fillMaxWidth()
            .height(112.dp)
            .clip(RoundedCornerShape(22.dp))
            .drawBehind {
                drawRect(Palette.Glass)
                drawRect(
                    Brush.linearGradient(
                        listOf(Color.Transparent, Color.White.copy(alpha = 0.08f), Color.Transparent),
                        start = Offset(size.width * x - size.width / 2, 0f),
                        end = Offset(size.width * x, size.height),
                    ),
                )
            },
    )
}

/** Confetti burst; plays each time [trigger] increases. */
@Composable
fun Celebration(trigger: Int) {
    if (trigger == 0) return
    val progress = remember(trigger) { Animatable(0f) }
    val colors = listOf(Palette.Sky, Palette.Mint, Palette.Amber, Palette.Blue, Palette.Violet, Palette.Coral)
    val particles = remember(trigger) {
        List(44) { i -> Triple(Random.nextFloat() * 360f, 0.45f + Random.nextFloat() * 0.75f, colors[i % colors.size]) }
    }
    LaunchedEffect(trigger) { progress.animateTo(1f, tween(1250, easing = LinearOutSlowInEasing)) }
    Canvas(Modifier.fillMaxSize()) {
        val p = progress.value
        if (p >= 1f) return@Canvas
        val origin = Offset(size.width / 2, size.height * 0.45f)
        particles.forEach { (angle, speed, color) ->
            val rad = Math.toRadians(angle.toDouble())
            val distance = size.minDimension * 0.6f * speed * p
            val pos = Offset(
                origin.x + cos(rad).toFloat() * distance,
                origin.y + sin(rad).toFloat() * distance + 420f * p * p,
            )
            drawCircle(color.copy(alpha = (1f - p).coerceIn(0f, 1f)), radius = 10f * (1f - p * 0.6f), center = pos)
        }
    }
}

@Composable
fun Toast(message: String?, onShown: () -> Unit, modifier: Modifier = Modifier) {
    LaunchedEffect(message) {
        if (message != null) {
            delay(2600)
            onShown()
        }
    }
    AnimatedVisibility(
        visible = message != null,
        modifier = modifier,
        enter = slideInVertically(spring(dampingRatio = 0.6f, stiffness = 380f)) { -it * 2 } + fadeIn(),
        exit = slideOutVertically(tween(260)) { -it * 2 } + fadeOut(),
    ) {
        Text(
            message.orEmpty(),
            color = Palette.Text,
            fontWeight = FontWeight.Medium,
            modifier = Modifier
                .padding(horizontal = 24.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xF01A2A55))
                .border(1.dp, Palette.GlassBorder, RoundedCornerShape(16.dp))
                .padding(horizontal = 18.dp, vertical = 12.dp),
        )
    }
}
