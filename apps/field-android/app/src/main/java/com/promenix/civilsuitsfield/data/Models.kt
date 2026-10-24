package com.promenix.civilsuitsfield.data

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
data class OrgRef(val name: String)

@Serializable
data class Profile(
    @SerialName("full_name") val fullName: String,
    @SerialName("org_id") val orgId: String,
    val organizations: OrgRef? = null,
)

@Serializable
data class RoleRow(val role: String)

@Serializable
data class CourtRef(val name: String)

@Serializable
data class BranchRef(@SerialName("branch_name") val branchName: String)

@Serializable
data class CaseRef(
    @SerialName("case_no_internal") val caseNo: String,
    val courts: CourtRef? = null,
    @SerialName("bank_branches") val branch: BranchRef? = null,
)

/** A Civil Suits field task. Only case number, court and branch are shown: no borrower data. */
@Serializable
data class FieldTask(
    val id: String,
    @SerialName("org_id") val orgId: String,
    @SerialName("case_id") val caseId: String,
    val kind: String,
    val status: String,
    @SerialName("due_at") val dueAt: String? = null,
    val instructions: String? = null,
    val note: String? = null,
    @SerialName("done_at") val doneAt: String? = null,
    @SerialName("proof_path") val proofPath: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    val cases: CaseRef? = null,
)
