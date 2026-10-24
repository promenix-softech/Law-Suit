package com.promenix.civilsuitsfield

import android.app.Application
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.SystemClock
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.promenix.civilsuitsfield.data.ApiException
import com.promenix.civilsuitsfield.data.AuthResponse
import com.promenix.civilsuitsfield.data.FieldTask
import com.promenix.civilsuitsfield.data.Profile
import com.promenix.civilsuitsfield.data.RoleRow
import com.promenix.civilsuitsfield.data.Session
import com.promenix.civilsuitsfield.data.SupabaseApi
import com.promenix.civilsuitsfield.data.UserFacing
import com.promenix.civilsuitsfield.security.TokenVault
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import kotlin.math.max
import kotlin.math.min

enum class Screen { Splash, Login, Locked, Main }

data class FieldUser(val fullName: String, val orgName: String?)

/** A proof photo attached to a task, already shrunk and stripped of EXIF/location data. */
data class Proof(val taskId: String, val preview: ImageBitmap)

data class UiState(
    val screen: Screen = Screen.Splash,
    val user: FieldUser? = null,
    val email: String? = null,
    val tasks: List<FieldTask> = emptyList(),
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val busy: Boolean = false,
    val preparingProof: Boolean = false,
    val proof: Proof? = null,
    val error: String? = null,
    val lockError: String? = null,
    val message: String? = null,
    val celebrate: Int = 0,
)

/** Task text must not carry identifiers (same rule as the web app and the database). */
private val PAN = Regex("\\b[A-Z]{5}[0-9]{4}[A-Z]\\b", RegexOption.IGNORE_CASE)
private val LONG_NUMBER = Regex("\\d{9,}")

fun noteProblem(note: String): String? = when {
    PAN.containsMatchIn(note) || LONG_NUMBER.containsMatchIn(note.replace(Regex("[\\s-]"), "")) ->
        "Remove account numbers, PAN, Aadhaar or phone numbers from the note."
    else -> null
}

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val api = SupabaseApi(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY)
    private val vault = TokenVault(app)
    private var session: Session? = null
    private var failedLogins = 0
    private var loginBlockedUntil = 0L
    private var proofBytes: ByteArray? = null

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        clearProofFiles()
        viewModelScope.launch {
            delay(1100) // let the splash animation play
            val saved = vault.load(KEY_REFRESH) != null
            _state.update { it.copy(screen = if (saved) Screen.Locked else Screen.Login) }
        }
    }

    // ---------------------------------------------------------------- sign-in and lock

    fun signIn(email: String, password: String) {
        if (_state.value.busy) return
        val wait = loginBlockedUntil - SystemClock.elapsedRealtime()
        if (wait > 0) {
            _state.update { it.copy(error = "Too many attempts. Try again in ${wait / 1000 + 1} seconds.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = null) }
            try {
                val cleanEmail = email.trim().lowercase()
                val auth = try {
                    api.signIn(cleanEmail, password)
                } catch (e: ApiException) {
                    if (e.code == 400 || e.code == 401) {
                        failedLogins++
                        if (failedLogins >= 5) {
                            loginBlockedUntil = SystemClock.elapsedRealtime() + 30_000
                            failedLogins = 0
                        }
                        throw UserFacing("Wrong email or password.")
                    }
                    throw e
                }
                failedLogins = 0
                startSession(auth)
                vault.save(KEY_EMAIL, cleanEmail)
                val user = loadFieldUser()
                if (user == null) {
                    endSession()
                    throw UserFacing("This app is for field staff. Please use the Civil Suits website.")
                }
                _state.update { it.copy(user = user, email = cleanEmail, screen = Screen.Main, busy = false) }
                loadAll()
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, error = friendly(e)) }
            }
        }
    }

    fun clearError() = _state.update { it.copy(error = null) }

    fun lock() {
        if (_state.value.screen == Screen.Main) _state.update { it.copy(screen = Screen.Locked, lockError = null) }
    }

    fun onLockError(message: String) = _state.update { it.copy(lockError = message, busy = false) }

    fun onUnlocked() {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, lockError = null) }
            try {
                val current = session
                if (current == null || current.expiresAt - 60_000 < System.currentTimeMillis()) {
                    val saved = vault.load(KEY_REFRESH) ?: throw UserFacing("Please sign in again.")
                    startSession(api.refresh(saved))
                }
                val user = _state.value.user ?: loadFieldUser()
                    ?: throw UserFacing("This app is for field staff. Please use the Civil Suits website.")
                _state.update { it.copy(user = user, email = vault.load(KEY_EMAIL), screen = Screen.Main, busy = false) }
                if (_state.value.tasks.isEmpty()) loadAll() else refresh()
            } catch (e: Exception) {
                val sessionGone = (e is ApiException && e.code in 400..499) || e is UserFacing
                if (sessionGone) {
                    forget()
                    _state.value = UiState(
                        screen = Screen.Login,
                        error = if (e is UserFacing) friendly(e) else "Your session ended. Please sign in again.",
                    )
                } else {
                    _state.update { it.copy(busy = false, lockError = friendly(e)) }
                }
            }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            val token = session?.accessToken
            forget()
            _state.value = UiState(screen = Screen.Login)
            if (token != null) runCatching { api.signOut(token) }
        }
    }

    private fun startSession(auth: AuthResponse) {
        session = Session(
            accessToken = auth.accessToken,
            refreshToken = auth.refreshToken,
            userId = auth.user.id,
            expiresAt = System.currentTimeMillis() + auth.expiresIn * 1000,
        )
        vault.save(KEY_REFRESH, auth.refreshToken)
    }

    private suspend fun endSession() {
        val token = session?.accessToken
        forget()
        if (token != null) runCatching { api.signOut(token) }
    }

    private fun forget() {
        session = null
        proofBytes = null
        vault.clear()
        clearProofFiles()
    }

    /** Runs [block] with a fresh access token; refreshes once on expiry or a 401. */
    private suspend fun <T> authed(block: suspend (String) -> T): T {
        val current = session ?: throw UserFacing("Please sign in again.")
        if (current.expiresAt - 60_000 < System.currentTimeMillis()) startSession(api.refresh(current.refreshToken))
        return try {
            block(session!!.accessToken)
        } catch (e: ApiException) {
            if (e.code != 401) throw e
            startSession(api.refresh(session!!.refreshToken))
            block(session!!.accessToken)
        }
    }

    // ---------------------------------------------------------------- data

    /** The signed-in person, only if they hold the field role in their office. */
    private suspend fun loadFieldUser(): FieldUser? {
        val uid = session?.userId ?: return null
        val roles = authed { api.select("/rest/v1/user_roles?select=role&user_id=eq.$uid", it, RoleRow.serializer()) }
        if (roles.none { it.role == "field" }) return null
        val profile = authed {
            api.select("/rest/v1/profiles?select=full_name,org_id,organizations(name)&id=eq.$uid", it, Profile.serializer())
        }.firstOrNull() ?: return null
        return FieldUser(profile.fullName, profile.organizations?.name)
    }

    private suspend fun fetchTasks() {
        val uid = session?.userId ?: return
        val tasks = authed {
            api.select(
                "/rest/v1/tasks?select=$TASK_FIELDS&assignee_id=eq.$uid&status=neq.cancelled&order=due_at.asc.nullslast&limit=200",
                it,
                FieldTask.serializer(),
            )
        }
        _state.update { it.copy(tasks = tasks) }
    }

    private fun loadAll() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            try {
                fetchTasks()
            } catch (e: Exception) {
                toast(friendly(e))
            }
            _state.update { it.copy(loading = false) }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            try {
                fetchTasks()
            } catch (e: Exception) {
                toast(friendly(e))
            }
            _state.update { it.copy(refreshing = false) }
        }
    }

    fun start(task: FieldTask) {
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            try {
                val updated = authed {
                    api.update("/rest/v1/tasks?id=eq.${task.id}&select=$TASK_FIELDS", it, buildJsonObject { put("status", "in_progress") }, FieldTask.serializer())
                } ?: throw UserFacing("This task is no longer assigned to you.")
                replace(updated, "Task started", celebrate = false)
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, message = friendly(e)) }
            }
        }
    }

    /** Uploads the proof photo (if any) to the case's field folder, then marks the task done. */
    fun complete(task: FieldTask, note: String) {
        if (_state.value.busy) return
        noteProblem(note)?.let {
            toast(it)
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            try {
                val bytes = proofBytes.takeIf { _state.value.proof?.taskId == task.id }
                var proofPath: String? = null
                if (bytes != null) {
                    proofPath = "${task.orgId}/${task.caseId}/field/${System.currentTimeMillis()}-${task.id.take(8)}.jpg"
                    try {
                        authed { api.upload("case-files", proofPath, it, bytes, "image/jpeg") }
                    } catch (e: ApiException) {
                        throw UserFacing("Photo upload was not allowed. Pull down to refresh and try again.")
                    }
                }
                val body = buildJsonObject {
                    put("status", "done")
                    if (note.isNotBlank()) put("note", note.trim().take(500))
                    if (proofPath != null) put("proof_path", proofPath)
                }
                val updated = authed { api.update("/rest/v1/tasks?id=eq.${task.id}&select=$TASK_FIELDS", it, body, FieldTask.serializer()) }
                    ?: throw UserFacing("This task is no longer assigned to you.")
                proofBytes = null
                clearProofFiles()
                _state.update { it.copy(proof = null) }
                replace(updated, "Marked done", celebrate = true)
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, message = friendly(e)) }
            }
        }
    }

    private fun replace(task: FieldTask, message: String, celebrate: Boolean) {
        _state.update { s ->
            s.copy(
                busy = false,
                tasks = s.tasks.map { if (it.id == task.id) task else it },
                message = message,
                celebrate = if (celebrate) s.celebrate + 1 else s.celebrate,
            )
        }
    }

    // ---------------------------------------------------------------- proof photo

    /** Shrinks the photo to at most 2000 px, fixes rotation and re-encodes it (drops EXIF/GPS). */
    fun attachProof(taskId: String, uri: Uri) {
        viewModelScope.launch {
            _state.update { it.copy(preparingProof = true) }
            try {
                val bytes = withContext(Dispatchers.IO) { shrink(uri) }
                val preview = withContext(Dispatchers.Default) {
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size).asImageBitmap()
                }
                proofBytes = bytes
                _state.update { it.copy(preparingProof = false, proof = Proof(taskId, preview)) }
            } catch (e: Exception) {
                _state.update { it.copy(preparingProof = false, message = friendly(e)) }
            }
        }
    }

    fun removeProof() {
        proofBytes = null
        clearProofFiles()
        _state.update { it.copy(proof = null) }
    }

    fun proofFile(): File {
        val dir = File(getApplication<Application>().cacheDir, PROOF_DIR).apply { mkdirs() }
        return File(dir, "capture-${System.currentTimeMillis()}.jpg")
    }

    private fun clearProofFiles() {
        File(getApplication<Application>().cacheDir, PROOF_DIR).listFiles()?.forEach { it.delete() }
    }

    private fun shrink(uri: Uri): ByteArray {
        val resolver = getApplication<Application>().contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw UserFacing("That file is not a photo.")
        var sample = 1
        while (bounds.outWidth / sample > 2600 || bounds.outHeight / sample > 2600) sample *= 2
        val decoded = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: throw UserFacing("Could not read the photo.")
        val orientation = runCatching {
            resolver.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
        }.getOrNull() ?: ExifInterface.ORIENTATION_NORMAL
        val degrees = when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
        val scale = min(1f, 2000f / max(decoded.width, decoded.height))
        val matrix = Matrix().apply {
            postScale(scale, scale)
            postRotate(degrees)
        }
        val output = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        return ByteArrayOutputStream().use { stream ->
            output.compress(Bitmap.CompressFormat.JPEG, 82, stream)
            stream.toByteArray()
        }
    }

    override fun onCleared() {
        clearProofFiles()
        super.onCleared()
    }

    // ---------------------------------------------------------------- messages

    fun clearMessage() = _state.update { it.copy(message = null) }

    fun toast(text: String) = _state.update { it.copy(message = text) }

    private fun friendly(e: Exception): String = when (e) {
        is UserFacing -> e.message ?: "Something went wrong."
        is ApiException -> when (e.code) {
            401, 403 -> "You're not allowed to do that."
            404 -> "Not found. Pull down to refresh."
            409 -> "This changed elsewhere. Pull down to refresh."
            400, 422 -> "Please check the details and try again."
            413 -> "The photo is too large."
            429 -> "Too many requests. Wait a minute and try again."
            in 500..599 -> "The server is busy. Try again shortly."
            else -> "Something went wrong (${e.code})."
        }
        is IOException -> "No internet connection. Check your network and try again."
        else -> "Something went wrong."
    }

    private companion object {
        const val KEY_REFRESH = "rt"
        const val KEY_EMAIL = "email"
        const val PROOF_DIR = "proof"
        const val TASK_FIELDS =
            "id,org_id,case_id,kind,status,due_at,instructions,note,done_at,proof_path,updated_at," +
                "cases(case_no_internal,courts(name),bank_branches(branch_name))"
    }
}
