package com.promenix.tasks.ui

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
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Person
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
import com.promenix.tasks.AppViewModel
import com.promenix.tasks.UiState
import com.promenix.tasks.data.Task

enum class Tab { Tasks, Updates, Profile }

@Composable
fun MainScreen(state: UiState, vm: AppViewModel, onLockNow: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(Tab.Tasks) }
    var openTaskId by rememberSaveable { mutableStateOf<String?>(null) }
    var showNewTask by remember { mutableStateOf(false) }
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
                            Tab.Updates -> if (state.isAdmin) {
                                UpdatesFeedTab(state, onRefresh = vm::refresh)
                            } else {
                                DailyUpdateTab(state, onSubmit = vm::submitUpdate)
                            }
                            Tab.Profile -> ProfileTab(state, onLockNow = onLockNow, onSignOut = vm::signOut)
                        }
                    }
                    BottomBar(
                        selected = tab,
                        isAdmin = state.isAdmin,
                        onSelect = { tab = it },
                        modifier = Modifier.align(Alignment.BottomCenter),
                    )
                    AnimatedContent(
                        targetState = state.isAdmin && tab == Tab.Tasks,
                        transitionSpec = { scaleIn(spring(dampingRatio = 0.5f)) togetherWith scaleOut(tween(150)) },
                        label = "fab",
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .navigationBarsPadding()
                            .padding(end = 22.dp, bottom = 96.dp),
                    ) { show ->
                        if (show) NewTaskFab { showNewTask = true }
                    }
                }
            }
        }
        if (showNewTask) {
            NewTaskSheet(state, onDismiss = { showNewTask = false }, onCreate = { draft -> vm.createTask(draft) { showNewTask = false } })
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
private fun NewTaskFab(onClick: () -> Unit) {
    val pulse = rememberInfiniteTransition(label = "fab")
    val glow by pulse.animateFloat(1f, 1.12f, infiniteRepeatable(tween(1100), RepeatMode.Reverse), label = "glow")
    Box(contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .size(64.dp)
                .graphicsLayer {
                    scaleX = glow
                    scaleY = glow
                    alpha = 0.35f
                }
                .clip(CircleShape)
                .background(Palette.Sky),
        )
        Box(
            Modifier
                .size(58.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(Palette.Sky, Palette.Royal)))
                .pressClick(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Add, contentDescription = "New task", tint = Color.White, modifier = Modifier.size(28.dp))
        }
    }
}

@Composable
private fun BottomBar(selected: Tab, isAdmin: Boolean, onSelect: (Tab) -> Unit, modifier: Modifier = Modifier) {
    val items: List<Triple<Tab, String, ImageVector>> = listOf(
        Triple(Tab.Tasks, "Tasks", Icons.AutoMirrored.Filled.List),
        Triple(Tab.Updates, if (isAdmin) "Updates" else "Daily update", Icons.AutoMirrored.Filled.Send),
        Triple(Tab.Profile, "Profile", Icons.Filled.Person),
    )
    Row(
        modifier
            .navigationBarsPadding()
            .padding(horizontal = 18.dp, vertical = 12.dp)
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
                if (active) {
                    Spacer(Modifier.width(6.dp))
                    Text(label, color = tint, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
            }
        }
    }
}

private fun statusOrder(status: String) = STATUSES.indexOf(status).let { if (it < 0) 9 else it }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksTab(state: UiState, onRefresh: () -> Unit, onOpen: (String) -> Unit) {
    var filter by rememberSaveable { mutableStateOf("all") }
    val visible = remember(state.tasks, filter) {
        state.tasks
            .filter { filter == "all" || it.status == filter }
            .sortedWith(compareBy<Task>({ statusOrder(it.status) }, { it.priority }, { it.dueOn ?: "9999-12-31" }))
    }
    PullToRefreshBox(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
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
                        StaggerIn(index) { TaskCard(task, state.isAdmin) { onOpen(task.id) } }
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
    val first = state.member?.fullName?.substringBefore(' ').orEmpty()
    StaggerIn(0) {
        GlassCard(Modifier.fillMaxWidth()) {
            Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(formatDay(todayIst()), color = Palette.Muted, fontSize = 13.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("Hi, $first", color = Palette.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        if (state.isAdmin) "Team board · ${state.interns.size} interns" else "Here's your work for today",
                        color = Palette.Muted,
                        fontSize = 13.sp,
                    )
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                        AnimatedCount(state.tasks.count { it.status == "todo" || it.status == "in_progress" }, Palette.Sky, "Open")
                        AnimatedCount(state.tasks.count { it.status == "in_review" }, Palette.Amber, "In review")
                        AnimatedCount(done, Palette.Mint, "Done")
                    }
                }
                ProgressRing(if (total == 0) 0f else done.toFloat() / total)
            }
        }
    }
}

@Composable
private fun FilterRow(state: UiState, selected: String, onSelect: (String) -> Unit) {
    val options = listOf("all" to "All") + STATUSES.map { it to statusLabel(it) }
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { (key, label) ->
            val active = key == selected
            val color = if (key == "all") Palette.Sky else statusColor(key)
            val bg by animateColorAsState(if (active) color.copy(alpha = 0.22f) else Palette.Glass, tween(260), label = "chip-bg")
            val fg by animateColorAsState(if (active) color else Palette.Muted, tween(260), label = "chip-fg")
            val count = if (key == "all") state.tasks.size else state.tasks.count { it.status == key }
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
fun TaskCard(task: Task, showAssignee: Boolean, onClick: () -> Unit) {
    GlassCard(Modifier.fillMaxWidth().pressClick(onClick = onClick)) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(
                Modifier
                    .width(5.dp)
                    .fillMaxHeight()
                    .background(Brush.verticalGradient(listOf(priorityColor(task.priority), priorityColor(task.priority).copy(alpha = 0.2f)))),
            )
            Column(Modifier.weight(1f).padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Tag(productLabel(task.product), productColor(task.product))
                    Spacer(Modifier.width(6.dp))
                    Tag(priorityLabel(task.priority), priorityColor(task.priority))
                    Spacer(Modifier.weight(1f))
                    StatusPill(task.status)
                }
                Spacer(Modifier.height(10.dp))
                Text(task.title, color = Palette.Text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (showAssignee && task.assignee != null) {
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Person, contentDescription = null, tint = Palette.Muted, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(task.assignee.fullName, color = Palette.Muted, fontSize = 13.sp)
                    }
                }
                val due = dueText(task.dueOn)
                if (due != null && task.status != "done") {
                    Spacer(Modifier.height(8.dp))
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
            if (filter == "all") "No tasks yet" else "Nothing in “${statusLabel(filter)}”",
            color = Palette.Text,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Text("Pull down to refresh.", color = Palette.Muted, fontSize = 14.sp, textAlign = TextAlign.Center)
    }
}
