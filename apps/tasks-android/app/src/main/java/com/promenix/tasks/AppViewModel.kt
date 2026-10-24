package com.promenix.tasks

import android.app.Application
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.promenix.tasks.data.ApiException
import com.promenix.tasks.data.AuthResponse
import com.promenix.tasks.data.DailyUpdate
import com.promenix.tasks.data.Member
import com.promenix.tasks.data.NewTask
import com.promenix.tasks.data.Session
import com.promenix.tasks.data.SupabaseApi
import com.promenix.tasks.data.Task
import com.promenix.tasks.data.TaskEvent
import com.promenix.tasks.data.UserFacing
import com.promenix.tasks.security.TokenVault
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException

enum class Screen { Splash, Login, Locked, Main }

data class UiState(
    val screen: Screen = Screen.Splash,
    val member: Member? = null,
    val email: String? = null,
    val tasks: List<Task> = emptyList(),
    val interns: List<Member> = emptyList(),
    val updates: List<DailyUpdate> = emptyList(),
    val events: Map<String, List<TaskEvent>> = emptyMap(),
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val busy: Boolean = false,
    val error: String? = null,
    val lockError: String? = null,
    val message: String? = null,
    val celebrate: Int = 0,
) {
    val isAdmin: Boolean get() = member?.role == "admin"
}

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val api = SupabaseApi(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY)
    private val vault = TokenVault(app)
    private var session: Session? = null
    private var failedLogins = 0
    private var loginBlockedUntil = 0L

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
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
                val member = loadMember()
                if (member == null) {
                    endSession()
                    throw UserFacing("This account is not on the Promenix intern board.")
                }
                _state.update { it.copy(member = member, email = cleanEmail, screen = Screen.Main, busy = false) }
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
                val member = _state.value.member ?: loadMember() ?: throw UserFacing("This account is not on the Promenix intern board.")
                _state.update { it.copy(member = member, email = vault.load(KEY_EMAIL), screen = Screen.Main, busy = false) }
                if (_state.value.tasks.isEmpty()) loadAll() else refresh()
            } catch (e: Exception) {
                val sessionGone = (e is ApiException && e.code in 400..499) || e is UserFacing
                if (sessionGone) {
                    forget()
                    _state.value = UiState(screen = Screen.Login, error = friendly(e).takeIf { e is UserFacing }
                        ?: "Your session ended. Please sign in again.")
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
        vault.clear()
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

    private suspend fun loadMember(): Member? {
        val uid = session?.userId ?: return null
        return authed {
            api.select("/rest/v1/intern_members?select=user_id,full_name,role&active=is.true&user_id=eq.$uid", it, Member.serializer())
        }.firstOrNull()
    }

    private suspend fun fetchAll() {
        val me = _state.value.member ?: return
        val tasks = authed { api.select("/rest/v1/intern_tasks?select=$TASK_FIELDS&order=updated_at.desc&limit=300", it, Task.serializer()) }
        if (me.role == "admin") {
            val interns = authed {
                api.select("/rest/v1/intern_members?select=user_id,full_name,role&role=eq.intern&active=is.true&order=full_name", it, Member.serializer())
            }
            val updates = authed {
                api.select("/rest/v1/intern_daily_updates?select=id,day,done,plan,blockers,member:intern_members(full_name)&order=day.desc,created_at.desc&limit=60", it, DailyUpdate.serializer())
            }
            _state.update { it.copy(tasks = tasks, interns = interns, updates = updates) }
        } else {
            val updates = authed {
                api.select("/rest/v1/intern_daily_updates?select=id,day,done,plan,blockers&order=day.desc&limit=30", it, DailyUpdate.serializer())
            }
            _state.update { it.copy(tasks = tasks, updates = updates) }
        }
    }

    private fun loadAll() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            try {
                fetchAll()
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
                fetchAll()
            } catch (e: Exception) {
                toast(friendly(e))
            }
            _state.update { it.copy(refreshing = false) }
        }
    }

    fun loadEvents(taskId: String) {
        viewModelScope.launch {
            try {
                val events = authed {
                    api.select("/rest/v1/intern_task_events?select=id,from_status,to_status,at&task_id=eq.$taskId&order=at.desc&limit=50", it, TaskEvent.serializer())
                }
                _state.update { it.copy(events = it.events + (taskId to events)) }
            } catch (_: Exception) {
                // History is optional; the task itself is already on screen.
            }
        }
    }

    fun setStatus(task: Task, to: String) {
        val message = when (to) {
            "in_progress" -> if (task.status == "in_review") "Taken back from review" else "Task started"
            "in_review" -> "Sent for review"
            else -> "Status updated"
        }
        mutateTask(task, buildJsonObject { put("status", to) }, message, celebrate = to == "in_review")
    }

    fun review(task: Task, approve: Boolean, note: String) {
        val body = buildJsonObject {
            put("status", if (approve) "done" else "in_progress")
            put("review_note", note.trim().take(1000))
        }
        mutateTask(task, body, if (approve) "Approved" else "Sent back to the intern", celebrate = approve)
    }

    private fun mutateTask(task: Task, body: JsonObject, message: String, celebrate: Boolean) {
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            try {
                val updated = authed { api.update("/rest/v1/intern_tasks?id=eq.${task.id}&select=$TASK_FIELDS", it, body, Task.serializer()) }
                    ?: throw UserFacing("This task is no longer available to you.")
                _state.update { s ->
                    s.copy(
                        busy = false,
                        tasks = s.tasks.map { if (it.id == task.id) updated else it },
                        message = message,
                        celebrate = if (celebrate) s.celebrate + 1 else s.celebrate,
                    )
                }
                loadEvents(task.id)
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, message = friendly(e)) }
            }
        }
    }

    fun createTask(draft: NewTask, onDone: () -> Unit) {
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            try {
                val body = buildJsonObject {
                    put("title", draft.title.trim().take(120))
                    put("details", draft.details.trim().take(4000))
                    put("acceptance", draft.acceptance.trim().take(2000))
                    put("product", draft.product)
                    put("priority", draft.priority)
                    put("assignee_id", draft.assigneeId)
                    if (draft.dueOn != null) put("due_on", draft.dueOn)
                }
                val created = authed { api.insert("/rest/v1/intern_tasks?select=$TASK_FIELDS", it, body, Task.serializer()) }
                _state.update { s ->
                    s.copy(
                        busy = false,
                        tasks = if (created != null) listOf(created) + s.tasks else s.tasks,
                        message = "Task assigned",
                        celebrate = s.celebrate + 1,
                    )
                }
                onDone()
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, message = friendly(e)) }
            }
        }
    }

    fun submitUpdate(done: String, plan: String, blockers: String) {
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true) }
            try {
                val body = buildJsonObject {
                    put("done", done.trim().take(1000))
                    put("plan", plan.trim().take(1000))
                    put("blockers", blockers.trim().take(1000))
                }
                val saved = authed {
                    api.insert(
                        "/rest/v1/intern_daily_updates?on_conflict=user_id,day&select=id,day,done,plan,blockers",
                        it, body, DailyUpdate.serializer(),
                        prefer = "resolution=merge-duplicates,return=representation",
                    )
                }
                _state.update { s ->
                    s.copy(
                        busy = false,
                        updates = if (saved != null) listOf(saved) + s.updates.filter { it.day != saved.day } else s.updates,
                        message = "Daily update sent",
                        celebrate = s.celebrate + 1,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, message = friendly(e)) }
            }
        }
    }

    fun clearMessage() = _state.update { it.copy(message = null) }

    private fun toast(text: String) = _state.update { it.copy(message = text) }

    private fun friendly(e: Exception): String = when (e) {
        is UserFacing -> e.message ?: "Something went wrong."
        is ApiException -> when (e.code) {
            401, 403 -> "You're not allowed to do that."
            404 -> "Not found. Pull down to refresh."
            409 -> "This changed elsewhere. Pull down to refresh."
            400, 422 -> "Please check the details and try again."
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
        const val TASK_FIELDS = "id,title,details,acceptance,product,priority,assignee_id,status,due_on,link,review_note,updated_at,assignee:intern_members(full_name)"
    }
}
