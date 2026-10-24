package com.promenix.civilsuitsfield.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.promenix.civilsuitsfield.AppViewModel
import com.promenix.civilsuitsfield.UiState
import com.promenix.civilsuitsfield.data.FieldTask

enum class Tab { Tasks, Profile }

fun kindIcon(kind: String): ImageVector = when (kind) {
    "collect_docs" -> Icons.AutoMirrored.Filled.List
    "notary" -> Icons.Filled.Create
    "efile" -> Icons.AutoMirrored.Filled.Send
    "dispatch_notice" -> Icons.Filled.MailOutline
    "draft" -> Icons.Filled.Edit
    else -> Icons.Filled.CheckCircle
}

@Composable
fun MainScreen(state: UiState, vm: AppViewModel, onLockNow: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(Tab.Tasks) }
    var openTaskId by rememberSaveable { mutableStateOf<String?>(null) }
    BackHandler(enabled = openTaskId != null) { openTaskId = null }

    AuroraBackground {
        AnimatedContent(
            targetState = openTaskId,
            transitionSpec = {
                if (targetState != null) {
                    (slideInHorizontally(tween(380)) { it } + fadeIn(tween(380))) togetherWith
                        (slideOutHorizontally(tween(380)) { -it / 4 } + fadeOut(tween(300)))
                } else {
                    (slideInHorizontally(tween(380)) { -it / 4 } + fadeIn(tween(380))) togetherWith
                        (slideOutHorizontally(tween(380)) { it } + fadeOut(tween(300)))
                }
            },
            label = "detail",
        ) { taskId ->
            val task = state.tasks.firstOrNull { it.id == taskId }
            if (task != null) {
                TaskDetailScreen(task, state, vm, onBack = { openTaskId = null })
            } else {
                Box(Modifier.fillMaxSize()) {
                    AnimatedContent(
                        targetState = tab,
                        transitionSpec = {
                            (fadeIn(tween(320)) + slideInVertically(tween(320)) { it / 14 }) togetherWith fadeOut(tween(180))
                        },
                        label = "tab",
                        modifier = Modifier.fillMaxSize(),
                    ) { current ->
                        when (current) {
                            Tab.Tasks -> TasksTab(state, onRefresh = vm::refresh, onOpen = { openTaskId = it })
                            Tab.Profile -> ProfileTab(state, onLockNow = onLockNow, onSignOut = vm::signOut)
                        }
                    }
                    BottomBar(selected = tab, onSelect = { tab = it }, modifier = Modifier.align(Alignment.BottomCenter))
                }
            }
        }
        Celebration(state.celebrate)
        Toast(
            message = state.message,
            onShown = vm::clearMessage,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(top = 10.dp),
        )
    }
}

@Composable
private fun BottomBar(selected: Tab, onSelect: (Tab) -> Unit, modifier: Modifier = Modifier) {
    val items: List<Triple<Tab, String, ImageVector>> = listOf(
        Triple(Tab.Tasks, "My tasks", Icons.AutoMirrored.Filled.List),
        Triple(Tab.Profile, "Profile", Icons.Filled.Person),
    )
    Row(
        modifier
            .navigationBarsPadding()
            .padding(horizontal = 40.dp, vertical = 12.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(26.dp))
            .background(Color(0xE60E1A3A))
            .border(1.dp, Palette.GlassBorder, RoundedCornerShape(26.dp))
            .padding(6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        items.forEach { (tab, label, icon) ->
            val active = tab == selected
            val bg by animateColorAsState(if (active) Palette.Blue.copy(alpha = 0.28f) else Color.Transparent, tween(300), label = "tab-bg")
            val tint by animateColorAsState(if (active) Palette.Sky else Palette.Muted, tween(300), label = "tab-tint")
            val scale by animateFloatAsState(if (active) 1.12f else 1f, spring(dampingRatio = 0.45f, stiffness = 400f), label = "tab-scale")
            Row(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(20.dp))
                    .background(bg)
                    .pressClick { onSelect(tab) }
                    .padding(vertical = 11.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    icon,
                    contentDescription = label,
                    tint = tint,
                    modifier = Modifier
                        .size(20.dp)
                        .graphicsLayer {
                            scaleX = scale
                            scaleY = scale
                        },
                )
                Spacer(Modifier.width(6.dp))
                Text(label, color = tint, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
    }
}

private fun statusOrder(status: String) = STATUSES.indexOf(status).let { if (it < 0) 9 else it }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksTab(state: UiState, onRefresh: () -> Unit, onOpen: (String) -> Unit) {
    var filter by rememberSaveable { mutableStateOf("active") }
    val visible = remember(state.tasks, filter) {
        state.tasks
            .filter {
                when (filter) {
                    "active" -> it.status == "open" || it.status == "in_progress"
                    "all" -> true
                    else -> it.status == filter
                }
            }
            .sortedWith(compareBy<FieldTask>({ statusOrder(it.status) }, { it.dueAt ?: "9999" }))
    }
    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 12.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "header") { Box(Modifier.statusBarsPadding()) { TasksHeader(state) } }
            item(key = "filters") { FilterRow(state, filter) { filter = it } }
            when {
                state.loading && state.tasks.isEmpty() -> repeat(3) { i -> item(key = "shimmer$i") { ShimmerCard() } }
                visible.isEmpty() -> item(key = "empty") { EmptyTasks(filter) }
                else -> itemsIndexed(visible, key = { _, t -> t.id }) { index, task ->
                    Box(Modifier.animateItem()) {
                        StaggerIn(index) { TaskCard(task) { onOpen(task.id) } }
                    }
                }
            }
        }
    }
}

@Composable
private fun TasksHeader(state: UiState) {
    val total = state.tasks.size
    val done = state.tasks.count { it.status == "done" }
    val first = state.user?.fullName?.substringBefore(' ').orEmpty()
    val overdue = state.tasks.count { it.status != "done" && dueText(it.dueAt)?.second == true }
    StaggerIn(0) {
        GlassCard(Modifier.fillMaxWidth()) {
            Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(formatDay(todayIst()), color = Palette.Muted, fontSize = 13.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("Hi, $first", color = Palette.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(state.user?.orgName ?: "Civil Suits field", color = Palette.Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                        AnimatedCount(state.tasks.count { it.status == "open" }, Palette.Sky, "To do")
                        AnimatedCount(state.tasks.count { it.status == "in_progress" }, Palette.Amber, "Started")
                        AnimatedCount(overdue, Palette.Coral, "Overdue")
                    }
                }
                ProgressRing(if (total == 0) 0f else done.toFloat() / total)
            }
        }
    }
}

@Composable
private fun FilterRow(state: UiState, selected: String, onSelect: (String) -> Unit) {
    val options = listOf(
        "active" to "Active",
        "open" to "To do",
        "in_progress" to "In progress",
        "done" to "Done",
        "all" to "All",
    )
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { (key, label) ->
            val active = key == selected
            val color = if (key == "active" || key == "all") Palette.Sky else statusColor(key)
            val bg by animateColorAsState(if (active) color.copy(alpha = 0.22f) else Palette.Glass, tween(260), label = "chip-bg")
            val fg by animateColorAsState(if (active) color else Palette.Muted, tween(260), label = "chip-fg")
            val count = when (key) {
                "active" -> state.tasks.count { it.status == "open" || it.status == "in_progress" }
                "all" -> state.tasks.size
                else -> state.tasks.count { it.status == key }
            }
            Text(
                "$label  $count",
                color = fg,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(bg)
                    .border(1.dp, if (active) color.copy(alpha = 0.5f) else Palette.GlassBorder, RoundedCornerShape(50))
                    .pressClick { onSelect(key) }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
fun TaskCard(task: FieldTask, onClick: () -> Unit) {
    val color = kindColor(task.kind)
    GlassCard(Modifier.fillMaxWidth().pressClick(onClick = onClick)) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(
                Modifier
                    .width(5.dp)
                    .fillMaxHeight()
                    .background(Brush.verticalGradient(listOf(color, color.copy(alpha = 0.2f)))),
            )
            Row(Modifier.weight(1f).padding(16.dp), verticalAlignment = Alignment.Top) {
                Box(
                    Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(color.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(kindIcon(task.kind), contentDescription = null, tint = color, modifier = Modifier.size(22.dp))
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(kindLabel(task.kind), color = Palette.Text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        StatusPill(task.status)
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(task.cases?.caseNo ?: "Case closed for you", color = Palette.Sky, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    task.cases?.courts?.name?.let { court ->
                        Spacer(Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Place, contentDescription = null, tint = Palette.Muted, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(court, color = Palette.Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    val due = dueText(task.dueAt)
                    if (due != null && task.status != "done") {
                        Spacer(Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.DateRange, contentDescription = null, tint = if (due.second) Palette.Coral else Palette.Muted, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(due.first, color = if (due.second) Palette.Coral else Palette.Muted, fontSize = 13.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyTasks(filter: String) {
    val float = rememberInfiniteTransition(label = "empty")
    val dy by float.animateFloat(-8f, 8f, infiniteRepeatable(tween(1800), RepeatMode.Reverse), label = "dy")
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = Palette.Mint,
            modifier = Modifier
                .size(64.dp)
                .graphicsLayer { translationY = dy },
        )
        Spacer(Modifier.height(14.dp))
        Text(
            if (filter == "active") "All caught up" else "Nothing here",
            color = Palette.Text,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Text("New tasks from the office appear here. Pull down to refresh.", color = Palette.Muted, fontSize = 14.sp, textAlign = TextAlign.Center)
    }
}
