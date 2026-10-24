package com.promenix.civilsuitsfield.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.promenix.civilsuitsfield.BuildConfig
import com.promenix.civilsuitsfield.UiState

@Composable
fun ProfileTab(state: UiState, onLockNow: () -> Unit, onSignOut: () -> Unit) {
    val name = state.user?.fullName.orEmpty()
    val initials = name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
    val spin = rememberInfiniteTransition(label = "avatar")
    val angle by spin.animateFloat(0f, 360f, infiniteRepeatable(tween(4000, easing = LinearEasing)), label = "angle")
    val protections = listOf(
        "Phone lock (fingerprint / face / PIN) needed to open",
        "Screenshots and screen recording blocked",
        "Session encrypted with the Android Keystore",
        "Locks itself after 1 minute in the background",
        "Photos shrunk and stripped of location before upload",
        "You see only the tasks assigned to you",
    )

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 12.dp, bottom = 120.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        item(key = "avatar") {
            StaggerIn(0, Modifier.statusBarsPadding()) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(top = 18.dp)) {
                    Box(Modifier.size(112.dp), contentAlignment = Alignment.Center) {
                        Canvas(Modifier.fillMaxSize().graphicsLayer { rotationZ = angle }) {
                            drawCircle(
                                brush = Brush.sweepGradient(listOf(Palette.Sky, Palette.Mint, Palette.Violet, Palette.Sky)),
                                radius = size.minDimension / 2 - 4.dp.toPx(),
                                style = Stroke(4.dp.toPx()),
                            )
                        }
                        Box(
                            Modifier
                                .size(92.dp)
                                .clip(CircleShape)
                                .background(Brush.linearGradient(listOf(Palette.Royal, Palette.Navy))),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(initials.ifEmpty { "F" }, color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(name, color = Palette.Text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text("Field staff · ${state.user?.orgName ?: "Civil Suits"}", color = Palette.Muted, fontSize = 13.sp, textAlign = TextAlign.Center)
                    state.email?.let { Text(it, color = Palette.Muted, fontSize = 12.sp) }
                }
            }
        }
        item(key = "security") {
            StaggerIn(1) {
                GlassCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(18.dp)) {
                        Text("SECURITY", color = Palette.Sky, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
                        Spacer(Modifier.height(10.dp))
                        protections.forEachIndexed { i, p ->
                            StaggerIn(i + 2) {
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 5.dp)) {
                                    Box(
                                        Modifier
                                            .size(22.dp)
                                            .clip(CircleShape)
                                            .background(Palette.Mint.copy(alpha = 0.18f)),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(Icons.Filled.Check, contentDescription = null, tint = Palette.Mint, modifier = Modifier.size(14.dp))
                                    }
                                    Spacer(Modifier.width(10.dp))
                                    Text(p, color = Palette.Text, fontSize = 14.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
        item(key = "actions") {
            StaggerIn(3) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    GradientButton("Lock now", onClick = onLockNow, modifier = Modifier.fillMaxWidth())
                    GhostButton("Sign out", onClick = onSignOut, modifier = Modifier.fillMaxWidth(), color = Palette.Coral)
                    Text(
                        "Civil Suits Field ${BuildConfig.VERSION_NAME} · Promenix Softech LLP",
                        color = Palette.Muted,
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                    )
                }
            }
        }
    }
}
