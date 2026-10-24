package com.promenix.civilsuitsfield.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import android.net.Uri
import com.promenix.civilsuitsfield.AppViewModel
import com.promenix.civilsuitsfield.UiState
import com.promenix.civilsuitsfield.data.FieldTask
import com.promenix.civilsuitsfield.noteProblem

@Composable
fun TaskDetailScreen(task: FieldTask, state: UiState, vm: AppViewModel, onBack: () -> Unit) {
    var note by rememberSaveable(task.id) { mutableStateOf("") }
    val context = LocalContext.current
    var pendingUri by remember { mutableStateOf<Uri?>(null) }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val uri = pendingUri
        if (saved && uri != null) vm.attachProof(task.id, uri)
    }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) vm.attachProof(task.id, uri)
    }
    val openCamera = {
        val file = vm.proofFile()
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        pendingUri = uri
        runCatching { takePicture.launch(uri) }.onFailure { vm.toast("No camera app found on this phone.") }
        Unit
    }

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
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val color = kindColor(task.kind)
                    Box(
                        Modifier
                            .size(54.dp)
                            .clip(CircleShape)
                            .background(color.copy(alpha = 0.18f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(kindIcon(task.kind), contentDescription = null, tint = color, modifier = Modifier.size(28.dp))
                    }
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(kindLabel(task.kind), color = Palette.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        Text(task.cases?.caseNo ?: "Case closed for you", color = Palette.Sky, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            StaggerIn(1) {
                GlassCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        task.cases?.courts?.name?.let { InfoRow("Court", it) }
                        task.cases?.branch?.branchName?.let { InfoRow("Bank branch", it) }
                        val due = dueText(task.dueAt)
                        InfoRow(
                            "Due",
                            due?.first ?: "No due date",
                            color = if (due?.second == true && task.status != "done") Palette.Coral else Palette.Text,
                        )
                        task.doneAt?.let { InfoRow("Completed", formatInstant(it), color = Palette.Mint) }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            StaggerIn(2) { GlassCard(Modifier.fillMaxWidth()) { StatusStepper(task.status, Modifier.padding(18.dp)) } }
            if (!task.instructions.isNullOrBlank()) {
                Spacer(Modifier.height(12.dp))
                StaggerIn(3) { Section("Instructions", task.instructions) }
            }
            if (task.status == "done") {
                if (!task.note.isNullOrBlank()) {
                    Spacer(Modifier.height(12.dp))
                    StaggerIn(4) { Section("Your note", task.note) }
                }
                Spacer(Modifier.height(12.dp))
                StaggerIn(5) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = if (task.proofPath != null) Palette.Mint else Palette.Muted)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            if (task.proofPath != null) "Proof photo sent to the office" else "No proof photo",
                            color = Palette.Muted,
                            fontSize = 14.sp,
                        )
                    }
                }
            }
            if (task.status == "in_progress") {
                Spacer(Modifier.height(12.dp))
                StaggerIn(4) {
                    GlassCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(18.dp)) {
                            Text("FINISH THE TASK", color = Palette.Sky, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
                            Spacer(Modifier.height(10.dp))
                            Field(
                                value = note,
                                onChange = { note = it },
                                label = "Note (e.g. notarised at Pune court, receipt taken)",
                                minLines = 2,
                                maxLength = 500,
                                imeAction = ImeAction.Done,
                            )
                            val problem = noteProblem(note)
                            AnimatedVisibility(problem != null) {
                                Text(problem.orEmpty(), color = Palette.Coral, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
                            }
                            Spacer(Modifier.height(14.dp))
                            ProofPicker(
                                state = state,
                                taskId = task.id,
                                onCamera = openCamera,
                                onGallery = { runCatching { pickImage.launch("image/*") } },
                                onRemove = vm::removeProof,
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(160.dp))
        }

        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Palette.Night.copy(alpha = 0.92f), Palette.Night)))
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 18.dp, vertical = 14.dp),
        ) {
            AnimatedContent(
                targetState = task.status,
                transitionSpec = { (fadeIn(tween(280)) + slideInVertically(tween(280)) { it / 2 }) togetherWith fadeOut(tween(160)) },
                label = "actions",
            ) { status ->
                when (status) {
                    "open" -> GradientButton("Start task", { vm.start(task) }, Modifier.fillMaxWidth(), loading = state.busy)
                    "in_progress" -> GradientButton(
                        "Mark done",
                        { vm.complete(task, note) },
                        Modifier.fillMaxWidth(),
                        loading = state.busy,
                        enabled = noteProblem(note) == null && !state.preparingProof,
                        colors = listOf(Color(0xFF14A37F), Palette.Mint),
                    )
                    else -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Palette.Mint)
                        Spacer(Modifier.width(8.dp))
                        Text("Done. Thank you!", color = Palette.Mint, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun ProofPicker(state: UiState, taskId: String, onCamera: () -> Unit, onGallery: () -> Unit, onRemove: () -> Unit) {
    val proof = state.proof?.takeIf { it.taskId == taskId }
    AnimatedContent(
        targetState = when {
            state.preparingProof -> "busy"
            proof != null -> "photo"
            else -> "empty"
        },
        transitionSpec = { (scaleIn(spring(dampingRatio = 0.6f), initialScale = 0.85f) + fadeIn()) togetherWith (scaleOut(tween(150)) + fadeOut(tween(150))) },
        label = "proof",
    ) { mode ->
        when (mode) {
            "busy" -> Row(Modifier.fillMaxWidth().padding(vertical = 18.dp), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator(Modifier.size(28.dp), color = Palette.Sky, strokeWidth = 3.dp)
            }
            "photo" -> Box {
                if (proof != null) {
                    Image(
                        bitmap = proof.preview,
                        contentDescription = "Proof photo",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .clip(RoundedCornerShape(18.dp)),
                    )
                }
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(10.dp)
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(Color(0xCC070F26))
                        .pressClick(onClick = onRemove),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Close, contentDescription = "Remove photo", tint = Color.White, modifier = Modifier.size(18.dp))
                }
            }
            else -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GhostButton("Take photo", onCamera, Modifier.weight(1f), color = Palette.Sky)
                GhostButton("Choose file", onGallery, Modifier.weight(1f), color = Palette.Muted)
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String, color: Color = Palette.Text) {
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.Top) {
        Text(label, color = Palette.Muted, fontSize = 13.sp, modifier = Modifier.width(110.dp))
        Text(value, color = color, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
    }
}

@Composable
fun StatusStepper(status: String, modifier: Modifier = Modifier) {
    val index = STATUSES.indexOf(status).coerceAtLeast(0)
    val progress by animateFloatAsState(index / 2f, tween(800, easing = FastOutSlowInEasing), label = "stepper")
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
                        if (i < index || (i == index && s == "done")) {
                            Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                        }
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
                    fontSize = 12.sp,
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
