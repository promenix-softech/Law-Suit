package com.promenix.tasks.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** HTTP error from Supabase; [code] drives the user-facing message, the body is never shown. */
class ApiException(val code: Int, val body: String) : Exception("HTTP $code")

/** Message that is safe to show as-is. */
class UserFacing(message: String) : Exception(message)

/**
 * Minimal Supabase client (Auth + PostgREST) over HTTPS. Only the publishable key ships in the
 * app; what a signed-in user can read or change is decided by row-level security on the server.
 */
class SupabaseApi(private val baseUrl: String, private val apiKey: String) {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .build()

    private fun request(path: String, token: String?): Request.Builder =
        Request.Builder()
            .url(baseUrl + path)
            .header("apikey", apiKey)
            .header("Accept", "application/json")
            .apply { if (token != null) header("Authorization", "Bearer $token") }

    private suspend fun execute(request: Request): String = withContext(Dispatchers.IO) {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw ApiException(response.code, text.take(300))
            text
        }
    }

    suspend fun signIn(email: String, password: String): AuthResponse {
        val body = buildJsonObject {
            put("email", email)
            put("password", password)
        }.toString().toRequestBody(jsonType)
        val text = execute(request("/auth/v1/token?grant_type=password", null).post(body).build())
        return json.decodeFromString(AuthResponse.serializer(), text)
    }

    suspend fun refresh(refreshToken: String): AuthResponse {
        val body = buildJsonObject { put("refresh_token", refreshToken) }.toString().toRequestBody(jsonType)
        val text = execute(request("/auth/v1/token?grant_type=refresh_token", null).post(body).build())
        return json.decodeFromString(AuthResponse.serializer(), text)
    }

    suspend fun signOut(accessToken: String) {
        execute(request("/auth/v1/logout?scope=local", accessToken).post("{}".toRequestBody(jsonType)).build())
    }

    suspend fun <T> select(path: String, token: String, serializer: KSerializer<T>): List<T> {
        val text = execute(request(path, token).get().build())
        return json.decodeFromString(ListSerializer(serializer), text)
    }

    suspend fun <T> update(path: String, token: String, body: JsonObject, serializer: KSerializer<T>): T? {
        val req = request(path, token)
            .header("Prefer", "return=representation")
            .patch(body.toString().toRequestBody(jsonType))
            .build()
        return json.decodeFromString(ListSerializer(serializer), execute(req)).firstOrNull()
    }

    suspend fun <T> insert(
        path: String,
        token: String,
        body: JsonObject,
        serializer: KSerializer<T>,
        prefer: String = "return=representation",
    ): T? {
        val req = request(path, token)
            .header("Prefer", prefer)
            .post(body.toString().toRequestBody(jsonType))
            .build()
        return json.decodeFromString(ListSerializer(serializer), execute(req)).firstOrNull()
    }
}
