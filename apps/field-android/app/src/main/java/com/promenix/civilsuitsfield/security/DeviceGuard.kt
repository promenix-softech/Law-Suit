package com.promenix.civilsuitsfield.security

import android.os.Build
import android.os.Debug
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.io.File

/** Refuses to run on rooted phones or with a debugger attached (release builds). */
object DeviceGuard {
    private val suPaths = listOf(
        "/system/bin/su", "/system/xbin/su", "/sbin/su", "/su/bin/su", "/data/local/su",
        "/data/local/bin/su", "/data/local/xbin/su", "/system/sd/xbin/su", "/system/app/Superuser.apk",
    )

    fun blockReason(isDebugBuild: Boolean): String? = when {
        !isDebugBuild && (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) ->
            "A debugger is attached. Close it and open Civil Suits Field again."
        suPaths.any { File(it).exists() } || Build.TAGS?.contains("test-keys") == true ->
            "This phone appears to be rooted. To keep client data safe, Civil Suits Field does not run on rooted phones."
        else -> null
    }
}

/** Fingerprint / face / screen-lock gate shown at start and after time in the background. */
object AppLock {
    private val authenticators: Int
        get() = if (Build.VERSION.SDK_INT >= 30) BIOMETRIC_STRONG or DEVICE_CREDENTIAL else BIOMETRIC_WEAK or DEVICE_CREDENTIAL

    fun canLock(activity: FragmentActivity): Boolean =
        BiometricManager.from(activity).canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS

    fun authenticate(activity: FragmentActivity, onSuccess: () -> Unit, onError: (String) -> Unit) {
        if (!canLock(activity)) {
            onError("Set a screen lock (PIN, pattern, fingerprint or face) on this phone to use Civil Suits Field.")
            return
        }
        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onSuccess()
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = onError(errString.toString())
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Civil Suits Field")
            .setSubtitle("Confirm it's you")
            .setAllowedAuthenticators(authenticators)
            .build()
        prompt.authenticate(info)
    }
}
