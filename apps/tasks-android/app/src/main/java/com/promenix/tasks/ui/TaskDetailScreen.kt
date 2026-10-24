package com.promenix.tasks.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.promenix.tasks.AppViewModel
import com.promenix.tasks.UiState
import com.promenix.tasks.data.Task
import com.promenix.tasks.data.TaskEvent

@Composable
fun TaskDetailScreen(task: Task, state: UiState, vm: AppViewModel, onBack: () -> Unit) {
    LaunchedEffect(task.id) { vm.loadEvents(task.id) }
    var note by rememberSaveable(task.id) { mutableStateOf("") }
    val uri = LocalUriHandler.current

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Palette.Text)
                }
                Text("Task", color = Palette.Muted, fontSize = 15.sp)
            }
            StaggerIn(0) {
                Column {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Tag(productLabel(task.product), productColor(task.product))
                        Tag(priorityLabel(task.priority) + " priority", priorityColor(task.priority))
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(task.title, color = Palette.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    val due = dueText(task.dueOn)
                    val who = task.assignee?.fullName?.takeIf { state.isAdmin }
                    Text(
                        listOfNotNull(who?.let { "Assigned to $it" }, due?.first).joinToString(" · "),
                        color = if (due?.second == true && task.status != "done") Palette.Coral else Palette.Muted,
                        fontSize = 14.sp,
                    )
                }
            }
            Spacer(Modifier.height(18.dp))
            StaggerIn(1) { GlassCard(Modifier.fillMaxWidth()) { StatusStepper(task.status, Modifier.padding(18.dp)) } }
            if (task.reviewNote.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                StaggerIn(2) { NoteCard("Note from the owner", task.reviewNote, Palette.Amber) }
            }
            if (task.details.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                StaggerIn(3) { Section("What to do", task.details) }
            }
            if (task.acceptance.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                StaggerIn(4) { Section("Done when", task.acceptance) }
            }
            task.link?.let { link ->
                Spacer(Modifier.height(12.dp))
                StaggerIn(5) {
                    GlassCard(Modifier.fillMaxWidth().pressClick { runCatching { uri.openUri(link) } }) {
                        Column(Modifier.padding(16.dp)) {
                            Text("GitHub", color = Palette.Muted, fontSize = 12.sp)
                            Text(link.removePrefix("https://github.com/"), color = Palette.Sky, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            StaggerIn(6) { History(state.events[task.id].orEmpty()) }
            Spacer(Modifier.height(220.dp))
        }

        ActionBar(
            task = task,
            state = state,
            note = note,
            onNote = { note = it },
            vm = vm,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@Composable
private fun ActionBar(task: Task, state: UiState, note: String, onNote: (String) -> Unit, vm: AppViewModel, modifier: Modifier) {
    Column(
        modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Palette.Night.copy(alpha = 0.92f), Palette.Night)))
            .navigationBarsPadding()
            .imePadding()
            .padding(horizontal = 18.dp, vertical = 14.dp),
    ) {
        AnimatedContent(
            targetState = task.status to state.isAdmin,
            transitionSpec = { (fadeIn(tween(280)) + slideInVertically(tween(280)) { it / 2 }) togetherWith fadeOut(tween(160)) },
            label = "actions",
        ) { (status, admin) ->
            Column(Modifier.fillMaxWidth()) {
                when {
                    !admin && status == "todo" ->
                        GradientButton("Start task", { vm.setStatus(task, "in_progress") }, Modifier.fillMaxWidth(), loading = state.busy)
                    !admin && status == "in_progress" ->
                        GradientButton(
                            "Send for review",
                            { vm.setStatus(task, "in_review") },
                            Modifier.fillMaxWidth(),
                            loading = state.busy,
                            colors = listOf(Palette.Amber, Palette.Coral),
                        )
                    !admin && status == "in_review" ->
                        GhostButton("Take back from review", { vm.setStatus(task, "in_progress") }, Modifier.fillMaxWidth(), enabled = !state.busy)
                    !admin && status == "done" ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Palette.Mint)
                            Spacer(Modifier.width(8.dp))
                            Text("Approved. Well done!", color = Palette.Mint, fontWeight = FontWeight.SemiBold)
                        }
                    admin && status == "in_review" -> {
                        Field(note, onNote, "Note for the intern (optional)", imeAction = ImeAction.Done, maxLength = 1000)
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            GhostButton("Send back", { vm.review(task, approve = false, note = note) }, Modifier.weight(1f), color = Palette.Amber, enabled = !state.busy)
                            GradientButton(
                                "Approve",
                                { vm.review(task, approve = true, note = note) },
                                Modifier.weight(1f),
                                loading = state.busy,
                                colors = listOf(Color(0xFF14A37F), Palette.Mint),
                            )
                        }
                    }
                    admin && status == "done" ->
                        GhostButton("Reopen task", { vm.review(task, approve = false, note = "") }, Modifier.fillMaxWidth(), enabled = !state.busy)
                    else ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Info, contentDescription = null, tint = Palette.Muted, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Waiting for the intern to send this for review", color = Palette.Muted, fontSize = 14.sp)
                        }
                }
            }
        }
    }
}

@Composable
fun StatusStepper(status: String, modifier: Modifier = Modifier) {
    val index = STATUSES.indexOf(status).coerceAtLeast(0)
    val progress by animateFloatAsState(index / 3f, tween(800, easing = FastOutSlowInEasing), label = "stepper")
    Column(modifier) {
        Box(Modifier.fillMaxWidth().height(26.dp), contentAlignment = Alignment.CenterStart) {
            Box(
                Modifier
                    .padding(horizontal = 12.dp)
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color.White.copy(alpha = 0.1f)),
            )
            Box(
                Modifier
                    .padding(horizontal = 12.dp)
                    .fillMaxWidth(progress)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Brush.horizontalGradient(listOf(Palette.Sky, statusColor(status)))),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                STATUSES.forEachIndexed { i, s ->
                    val reached = i <= index
                    val dot by animateColorAsState(if (reached) statusColor(s) else Color(0xFF26355E), tween(500), label = "dot")
                    val scale by animateFloatAsState(if (i == index) 1.25f else 1f, spring(dampingRatio = 0.4f, stiffness = 300f), label = "dot-scale")
                    Box(
                        Modifier
                            .size(24.dp)
                            .graphicsLayer {
                                scaleX = scale
                                scaleY = scale
                            }
                            .clip(CircleShape)
                            .background(dot),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (i < index) Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            STATUSES.forEachIndexed { i, s ->
                Text(
                    statusLabel(s),
                    color = if (i == index) statusColor(s) else Palette.Muted,
                    fontSize = 11.sp,
                    fontWeight = if (i == index) FontWeight.Bold else FontWeight.Normal,
                )
            }
        }
    }
}

@Composable
private fun Section(title: String, body: String) {
    GlassCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp)) {
            Text(title.uppercase(), color = Palette.Sky, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
            Spacer(Modifier.height(8.dp))
            Text(body, color = Palette.Text, fontSize = 15.sp, lineHeight = 22.sp)
        }
    }
}

@Composable
private fun NoteCard(title: String, body: String, color: Color) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(18.dp),
    ) {
        Text(title, color = color, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(body, color = Palette.Text, fontSize = 15.sp, lineHeight = 22.sp)
    }
}

@Composable
private fun History(events: List<TaskEvent>) {
    GlassCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp)) {
            Text("HISTORY", color = Palette.Sky, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
            Spacer(Modifier.height(10.dp))
            if (events.isEmpty()) {
                Text("No changes yet.", color = Palette.Muted, fontSize = 14.sp)
            }
            events.forEachIndexed { i, e ->
                Row(verticalAlignment = Alignment.Top, modifier = Modifier.padding(bottom = if (i == events.lastIndex) 0.dp else 12.dp)) {
                    Box(
                        Modifier
                            .padding(top = 5.dp)
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(statusColor(e.toStatus)),
                    )
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(eventLabel(e), color = Palette.Text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text(formatInstant(e.at), color = Palette.Muted, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

private fun eventLabel(e: TaskEvent): String = when {
    e.fromStatus == null -> "Task assigned"
    e.toStatus == "in_progress" && e.fromStatus == "todo" -> "Started"
    e.toStatus == "in_review" -> "Sent for review"
    e.toStatus == "done" -> "Approved"
    e.toStatus == "in_progress" && e.fromStatus == "done" -> "Reopened"
    e.toStatus == "in_progress" -> "Back in progress"
    else -> statusLabel(e.toStatus)
}
