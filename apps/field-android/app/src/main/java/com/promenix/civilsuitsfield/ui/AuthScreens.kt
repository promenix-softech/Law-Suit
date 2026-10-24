package com.promenix.civilsuitsfield.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.promenix.civilsuitsfield.UiState
import kotlinx.coroutines.delay

@Composable
fun SplashScreen() {
    val scale = remember { Animatable(0.4f) }
    var showText by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        scale.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = 180f))
    }
    LaunchedEffect(Unit) {
        delay(380)
        showText = true
    }
    AuroraBackground {
        Column(
            Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            LogoMark(
                diameter = 132.dp,
                modifier = Modifier.graphicsLayer {
                    scaleX = scale.value
                    scaleY = scale.value
                },
            )
            Spacer(Modifier.height(26.dp))
            Reveal(showText) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("CIVIL SUITS", color = Palette.Text, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 5.sp)
                    Text("FIELD", color = Palette.Sky, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 8.sp)
                }
            }
        }
    }
}

@Composable
fun LoginScreen(state: UiState, onSignIn: (String, String) -> Unit, onClearError: () -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var stage by remember { mutableIntStateOf(0) }
    val shake = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        repeat(4) {
            delay(120)
            stage++
        }
    }
    LaunchedEffect(state.error) {
        if (state.error != null) {
            for (x in listOf(22f, -18f, 14f, -9f, 5f, 0f)) shake.animateTo(x, tween(55))
        }
    }
    val canSubmit = email.contains('@') && password.length >= 6 && !state.busy
    val submit = { if (canSubmit) onSignIn(email, password) }

    AuroraBackground {
        Column(
            Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(56.dp))
            Reveal(stage >= 1) { LogoMark(104.dp) }
            Spacer(Modifier.height(22.dp))
            Reveal(stage >= 2) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Civil Suits Field", color = Palette.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(6.dp))
                    Text("Sign in with your Civil Suits field account", color = Palette.Muted, fontSize = 14.sp, textAlign = TextAlign.Center)
                }
            }
            Spacer(Modifier.height(30.dp))
            Reveal(stage >= 3) {
                GlassCard(Modifier.fillMaxWidth().graphicsLayer { translationX = shake.value }) {
                    Column(Modifier.padding(20.dp)) {
                        Field(
                            value = email,
                            onChange = {
                                email = it.trim()
                                onClearError()
                            },
                            label = "Work email",
                            keyboardType = KeyboardType.Email,
                            maxLength = 120,
                        )
                        Spacer(Modifier.height(12.dp))
                        Field(
                            value = password,
                            onChange = {
                                password = it
                                onClearError()
                            },
                            label = "Password",
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done,
                            onDone = submit,
                            password = true,
                            showPassword = showPassword,
                            maxLength = 128,
                            trailing = {
                                TextButton(onClick = { showPassword = !showPassword }) {
                                    Text(if (showPassword) "Hide" else "Show", color = Palette.Sky)
                                }
                            },
                        )
                        AnimatedVisibility(state.error != null) {
                            Text(
                                state.error.orEmpty(),
                                color = Palette.Coral,
                                fontSize = 14.sp,
                                modifier = Modifier.padding(top = 12.dp),
                            )
                        }
                        Spacer(Modifier.height(18.dp))
                        GradientButton(
                            text = "Sign in",
                            onClick = submit,
                            modifier = Modifier.fillMaxWidth(),
                            loading = state.busy,
                            enabled = canSubmit,
                        )
                    }
                }
            }
            Spacer(Modifier.height(22.dp))
            Reveal(stage >= 4) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Lock, contentDescription = null, tint = Palette.Mint, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Device lock · screenshots blocked · encrypted session", color = Palette.Muted, fontSize = 12.sp)
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
fun LockScreen(state: UiState, onUnlock: () -> Unit) {
    LaunchedEffect(Unit) {
        delay(450)
        onUnlock()
    }
    AuroraBackground {
        Column(
            Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            LogoMark(124.dp)
            Spacer(Modifier.height(28.dp))
            Text("Civil Suits Field is locked", color = Palette.Text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(
                "Use your fingerprint, face or screen lock to continue.",
                color = Palette.Muted,
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
            )
            AnimatedVisibility(state.lockError != null) {
                Text(
                    state.lockError.orEmpty(),
                    color = Palette.Coral,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 14.dp),
                )
            }
            Spacer(Modifier.height(28.dp))
            GradientButton("Unlock", onClick = onUnlock, modifier = Modifier.fillMaxWidth(), loading = state.busy)
        }
    }
}

@Composable
fun BlockedScreen(reason: String) {
    AuroraBackground {
        Column(
            Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(Icons.Filled.Warning, contentDescription = null, tint = Palette.Amber, modifier = Modifier.size(56.dp))
            Spacer(Modifier.height(18.dp))
            Text("Can't open on this phone", color = Palette.Text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(10.dp))
            Text(reason, color = Palette.Muted, fontSize = 15.sp, textAlign = TextAlign.Center)
        }
    }
}
