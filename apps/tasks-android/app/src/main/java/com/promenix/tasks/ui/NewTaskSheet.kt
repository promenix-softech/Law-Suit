package com.promenix.tasks.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.promenix.tasks.UiState
import com.promenix.tasks.data.NewTask

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewTaskSheet(state: UiState, onDismiss: () -> Unit, onCreate: (NewTask) -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var title by rememberSaveable { mutableStateOf("") }
    var details by rememberSaveable { mutableStateOf("") }
    var acceptance by rememberSaveable { mutableStateOf("") }
    var product by rememberSaveable { mutableStateOf("homigo") }
    var priority by rememberSaveable { mutableIntStateOf(2) }
    var assignee by rememberSaveable { mutableStateOf(state.interns.firstOrNull()?.userId) }
    var dueDays by rememberSaveable { mutableIntStateOf(7) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Palette.Deep) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
        ) {
            Text("New task", color = Palette.Text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(14.dp))
            Field(title, { title = it }, "Title", maxLength = 120)
            Spacer(Modifier.height(10.dp))
            Field(details, { details = it }, "What to do", minLines = 3, maxLength = 4000)
            Spacer(Modifier.height(10.dp))
            Field(acceptance, { acceptance = it }, "Done when (acceptance)", minLines = 2, maxLength = 2000)

            Label("App")
            ChoiceRow(
                options = listOf("civil_suits", "homigo", "both").map { it to productLabel(it) },
                selected = product,
                colorOf = { productColor(it) },
                onSelect = { product = it },
            )
            Label("Priority")
            ChoiceRow(
                options = listOf(1, 2, 3).map { it.toString() to priorityLabel(it) },
                selected = priority.toString(),
                colorOf = { priorityColor(it.toInt()) },
                onSelect = { priority = it.toInt() },
            )
            Label("Assign to")
            if (state.interns.isEmpty()) {
                Text("No active interns yet. Add them on the intern board first.", color = Palette.Muted, fontSize = 14.sp)
            } else {
                ChoiceRow(
                    options = state.interns.map { it.userId to it.fullName },
                    selected = assignee.orEmpty(),
                    colorOf = { Palette.Sky },
                    onSelect = { assignee = it },
                )
            }
            Label("Due")
            ChoiceRow(
                options = listOf(3, 7, 14, 0).map { it.toString() to if (it == 0) "No date" else "$it days" },
                selected = dueDays.toString(),
                colorOf = { Palette.Violet },
                onSelect = { dueDays = it.toInt() },
            )
            Spacer(Modifier.height(22.dp))
            GradientButton(
                text = "Assign task",
                onClick = {
                    val who = assignee ?: return@GradientButton
                    onCreate(
                        NewTask(
                            title = title,
                            details = details,
                            acceptance = acceptance,
                            product = product,
                            priority = priority,
                            assigneeId = who,
                            dueOn = if (dueDays == 0) null else todayIst().plusDays(dueDays.toLong()).toString(),
                        ),
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                loading = state.busy,
                enabled = title.trim().length >= 3 && assignee != null,
            )
        }
    }
}

@Composable
private fun Label(text: String) {
    Spacer(Modifier.height(16.dp))
    Text(text, color = Palette.Muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun ChoiceRow(
    options: List<Pair<String, String>>,
    selected: String,
    colorOf: (String) -> Color,
    onSelect: (String) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { (key, label) ->
            val active = key == selected
            val color = colorOf(key)
            val bg by animateColorAsState(if (active) color.copy(alpha = 0.24f) else Palette.Glass, tween(240), label = "choice-bg")
            val fg by animateColorAsState(if (active) color else Palette.Muted, tween(240), label = "choice-fg")
            Text(
                label,
                color = fg,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(bg)
                    .border(1.dp, if (active) color.copy(alpha = 0.55f) else Palette.GlassBorder, RoundedCornerShape(14.dp))
                    .pressClick { onSelect(key) }
                    .padding(horizontal = 14.dp, vertical = 9.dp),
            )
        }
    }
}
