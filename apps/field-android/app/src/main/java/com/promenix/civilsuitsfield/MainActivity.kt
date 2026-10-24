package com.promenix.civilsuitsfield

import android.os.Bundle
import android.os.SystemClock
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.promenix.civilsuitsfield.security.AppLock
import com.promenix.civilsuitsfield.security.DeviceGuard
import com.promenix.civilsuitsfield.ui.BlockedScreen
import com.promenix.civilsuitsfield.ui.LockScreen
import com.promenix.civilsuitsfield.ui.LoginScreen
import com.promenix.civilsuitsfield.ui.MainScreen
import com.promenix.civilsuitsfield.ui.PromenixTheme
import com.promenix.civilsuitsfield.ui.SplashScreen

class MainActivity : FragmentActivity() {
    private val vm: AppViewModel by viewModels()
    private var stoppedAt = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // No screenshots, no screen recording, blank preview in the recent-apps list.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        enableEdgeToEdge()
        // Ignore taps while another app draws over this one (tapjacking).
        window.decorView.filterTouchesWhenObscured = true

        val blocked = DeviceGuard.blockReason(isDebugBuild = BuildConfig.DEBUG)
        setContent {
            PromenixTheme {
                AppRoot(vm, blocked, onUnlock = ::unlock)
            }
        }
    }

    private fun unlock() {
        AppLock.authenticate(this, onSuccess = vm::onUnlocked, onError = vm::onLockError)
    }

    override fun onStop() {
        super.onStop()
        stoppedAt = SystemClock.elapsedRealtime()
    }

    override fun onStart() {
        super.onStart()
        if (stoppedAt != 0L && SystemClock.elapsedRealtime() - stoppedAt > LOCK_AFTER_MS) vm.lock()
    }

    private companion object {
        const val LOCK_AFTER_MS = 60_000L
    }
}

@Composable
private fun AppRoot(vm: AppViewModel, blockedReason: String?, onUnlock: () -> Unit) {
    if (blockedReason != null) {
        BlockedScreen(blockedReason)
        return
    }
    val state by vm.state.collectAsStateWithLifecycle()
    AnimatedContent(
        targetState = state.screen,
        transitionSpec = {
            (fadeIn(tween(500)) + scaleIn(tween(500), initialScale = 0.94f)) togetherWith fadeOut(tween(260))
        },
        label = "root",
    ) { screen ->
        when (screen) {
            Screen.Splash -> SplashScreen()
            Screen.Login -> LoginScreen(state, onSignIn = vm::signIn, onClearError = vm::clearError)
            Screen.Locked -> LockScreen(state, onUnlock)
            Screen.Main -> MainScreen(state, vm, onLockNow = vm::lock)
        }
    }
}
