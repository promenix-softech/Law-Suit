package com.promenix.tasks.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AuthUser(val id: String, val email: String? = null)

@Serializable
data class AuthResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_in") val expiresIn: Long,
    val user: AuthUser,
)

data class Session(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    val expiresAt: Long,
)

@Serializable
data class Member(
    @SerialName("user_id") val userId: String,
    @SerialName("full_name") val fullName: String,
    val role: String,
)

@Serializable
data class NameRef(@SerialName("full_name") val fullName: String)

@Serializable
data class Task(
    val id: String,
    val title: String,
    val details: String = "",
    val acceptance: String = "",
    val product: String,
    val priority: Int = 2,
    @SerialName("assignee_id") val assigneeId: String,
    val status: String,
    @SerialName("due_on") val dueOn: String? = null,
    val link: String? = null,
    @SerialName("review_note") val reviewNote: String = "",
    @SerialName("updated_at") val updatedAt: String? = null,
    val assignee: NameRef? = null,
)

@Serializable
data class TaskEvent(
    val id: Long,
    @SerialName("from_status") val fromStatus: String? = null,
    @SerialName("to_status") val toStatus: String,
    val at: String,
)

@Serializable
data class DailyUpdate(
    val id: String,
    val day: String,
    val done: String,
    val plan: String,
    val blockers: String = "",
    val member: NameRef? = null,
)

data class NewTask(
    val title: String,
    val details: String,
    val acceptance: String,
    val product: String,
    val priority: Int,
    val assigneeId: String,
    val dueOn: String?,
)
