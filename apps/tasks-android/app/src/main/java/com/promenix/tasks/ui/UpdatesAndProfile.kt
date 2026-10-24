package com.promenix.tasks.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.promenix.tasks.BuildConfig
import com.promenix.tasks.UiState
import com.promenix.tasks.data.DailyUpdate

@Composable
fun DailyUpdateTab(state: UiState, onSubmit: (String, String, String) -> Unit) {
    val today = todayIst().toString()
    val todays = state.updates.firstOrNull { it.day == today }
    var done by rememberSaveable(todays?.id) { mutableStateOf(todays?.done.orEmpty()) }
    var plan by rememberSaveable(todays?.id) { mutableStateOf(todays?.plan.orEmpty()) }
    var blockers by rememberSaveable(todays?.id) { mutableStateOf(todays?.blockers.orEmpty()) }
    val earlier = state.updates.filter { it.day != today }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 12.dp, bottom = 120.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "title") {
            StaggerIn(0, Modifier.statusBarsPadding()) {
                Column {
                    Text("Daily update", color = Palette.Text, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                    Text("${formatDay(todayIst())} · send it before 7:00 PM", color = Palette.Muted, fontSize = 14.sp)
                }
            }
        }
        item(key = "form") {
            StaggerIn(1) {
                GlassCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(18.dp)) {
                        Field(done, { done = it }, "Done today", minLines = 3)
                        Spacer(Modifier.height(10.dp))
                        Field(plan, { plan = it }, "Plan for tomorrow", minLines = 3)
                        Spacer(Modifier.height(10.dp))
                        Field(blockers, { blockers = it }, "Blockers (optional)", minLines = 2)
                        Spacer(Modifier.height(16.dp))
                        GradientButton(
                            text = if (todays == null) "Send update" else "Update today's note",
                            onClick = { onSubmit(done, plan, blockers) },
                            modifier = Modifier.fillMaxWidth(),
                            loading = state.busy,
                            enabled = done.isNotBlank() && plan.isNotBlank(),
                        )
                    }
                }
            }
        }
        if (earlier.isNotEmpty()) {
            item(key = "earlier") { Text("Earlier", color = Palette.Muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
        }
        itemsIndexed(earlier, key = { _, u -> u.id }) { i, u ->
            Box(Modifier.animateItem()) { StaggerIn(i + 2) { UpdateCard(u, showName = false) } }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpdatesFeedTab(state: UiState, onRefresh: () -> Unit) {
    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 12.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "title") {
                StaggerIn(0, Modifier.statusBarsPadding()) {
                    Column {
                        Text("Daily updates", color = Palette.Text, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                        val today = todayIst().toString()
                        val sent = state.updates.count { it.day == today }
                        Text("$sent of ${state.interns.size} interns updated today", color = Palette.Muted, fontSize = 14.sp)
                    }
                }
            }
            if (state.updates.isEmpty()) {
                item(key = "empty") { Text("No updates yet.", color = Palette.Muted, fontSize = 15.sp, modifier = Modifier.padding(top = 24.dp)) }
            }
            itemsIndexed(state.updates, key = { _, u -> u.id }) { i, u ->
                Box(Modifier.animateItem()) { StaggerIn(i + 1) { UpdateCard(u, showName = true) } }
            }
        }
    }
}

@Composable
private fun UpdateCard(update: DailyUpdate, showName: Boolean) {
    var open by remember { mutableStateOf(false) }
    val turn by androidx.compose.animation.core.animateFloatAsState(if (open) 180f else 0f, spring(dampingRatio = 0.6f), label = "chevron")
    GlassCard(
        Modifier
            .fillMaxWidth()
            .animateContentSize(spring(dampingRatio = 0.8f, stiffness = 380f))
            .pressClick { open = !open },
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    if (showName) Text(update.member?.fullName ?: "Intern", color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text(formatDay(update.day), color = if (showName) Palette.Muted else Palette.Text, fontSize = if (showName) 12.sp else 15.sp)
                }
                if (update.blockers.isNotBlank()) Tag("Blocked", Palette.Coral)
                Icon(
                    Icons.Filled.KeyboardArrowDown,
                    contentDescription = if (open) "Collapse" else "Expand",
                    tint = Palette.Muted,
                    modifier = Modifier.graphicsLayer { rotationZ = turn },
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(update.done, color = Palette.Text, fontSize = 14.sp, maxLines = if (open) Int.MAX_VALUE else 2, overflow = TextOverflow.Ellipsis)
            if (open) {
                Spacer(Modifier.height(10.dp))
                Text("Next", color = Palette.Sky, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text(update.plan, color = Palette.Text, fontSize = 14.sp)
                if (update.blockers.isNotBlank()) {
                    Spacer(Modifier.height(10.dp))
                    Text("Blockers", color = Palette.Coral, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Text(update.blockers, color = Palette.Text, fontSize = 14.sp)
                }
            }
        }
    }
}

@Composable
fun ProfileTab(state: UiState, onLockNow: () -> Unit, onSignOut: () -> Unit) {
    val name = state.member?.fullName.orEmpty()
    val initials = name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
    val spin = rememberInfiniteTransition(label = "avatar")
    val angle by spin.animateFloat(0f, 360f, infiniteRepeatable(tween(4000, easing = LinearEasing)), label = "angle")
    val protections = listOf(
        "Screen lock required to open the app",
        "Screenshots and screen recording blocked",
        "Session encrypted with the Android Keystore",
        "Locks itself after 1 minute in the background",
        "HTTPS only; no backups leave the phone",
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
                            Text(initials.ifEmpty { "P" }, color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(name, color = Palette.Text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text(
                        (if (state.isAdmin) "Owner · admin" else "Backend intern") + (state.email?.let { " · $it" } ?: ""),
                        color = Palette.Muted,
                        fontSize = 13.sp,
                    )
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
                        "Promenix Tasks ${BuildConfig.VERSION_NAME} · Promenix Softech LLP",
                        color = Palette.Muted,
                        fontSize = 12.sp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }
        }
    }
}
