package com.workstudio.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Android 15+ draws apps edge-to-edge: use dark status-bar icons and keep content below the status bar.
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            WorkStudioTheme {
                Box(Modifier.fillMaxSize().background(WorkColors.Background).statusBarsPadding()) { WorkStudioApp() }
            }
        }
    }
}

private enum class AppScreen { Loading, Login, Register, Guest, Client }

/** Only CLIENT accounts may use this app; administrators use the web panel. */
private const val CLIENT_ROLE = "CLIENT"

@Composable
private fun WorkStudioApp() {
    val context = LocalContext.current.applicationContext
    val scope = rememberCoroutineScope()
    // Not saveable on purpose: after recreation the session is restored and re-verified from scratch.
    var screen by remember { mutableStateOf(AppScreen.Loading) }
    var token by remember { mutableStateOf<String?>(null) }
    var authError by rememberSaveable { mutableStateOf("") }

    fun signOut(reason: String = "") {
        token?.let { current -> scope.launch { runCatching { WorkApi.logout(current) } } }
        SecureSession.clear(context)
        token = null
        authError = reason
        screen = AppScreen.Login
    }

    // Restore the encrypted token and verify the live server session (TC-08).
    LaunchedEffect(Unit) {
        val saved = withContext(Dispatchers.IO) { SecureSession.load(context) }
        if (saved == null) {
            if (screen == AppScreen.Loading) screen = AppScreen.Login
            return@LaunchedEffect
        }
        try {
            val user = WorkApi.me(saved)
            if (user.role == CLIENT_ROLE) {
                token = saved
                screen = AppScreen.Client
            } else {
                SecureSession.clear(context)
                authError = "The mobile app is for clients. Administrators use the web panel."
                screen = AppScreen.Login
            }
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) {
            if (e.isUnauthenticated) {
                SecureSession.clear(context)
                authError = "Your session has expired. Please sign in again."
            } else {
                // Keep the token: the server may be waking up; the next start can restore the session.
                authError = e.userMessage()
            }
            screen = AppScreen.Login
        }
    }

    BackHandler(enabled = screen == AppScreen.Register || screen == AppScreen.Guest) { screen = AppScreen.Login }

    when (screen) {
        AppScreen.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        AppScreen.Register -> RegisterScreen(onBackToLogin = { screen = AppScreen.Login })
        AppScreen.Guest -> ClientHome(
            token = null,
            onSessionExpired = { screen = AppScreen.Login },
            onLogout = { screen = AppScreen.Login },
            onLoginRequested = { authError = ""; screen = AppScreen.Login }
        )
        AppScreen.Client -> {
            val current = token
            if (current == null) {
                LaunchedEffect(Unit) { screen = AppScreen.Login }
            } else ClientHome(
                token = current,
                onSessionExpired = { signOut("Your session has expired. Please sign in again.") },
                onLogout = { signOut() },
                onLoginRequested = { signOut() }
            )
        }
        AppScreen.Login -> LoginScreen(
            externalError = authError,
            onSignUp = { authError = ""; screen = AppScreen.Register },
            onBrowseAsGuest = { authError = ""; screen = AppScreen.Guest },
            onLoginSuccess = { result ->
                if (result.user.role != CLIENT_ROLE) {
                    scope.launch { runCatching { WorkApi.logout(result.token) } }
                    authError = "The mobile app is for clients. Administrators use the web panel."
                } else {
                    try {
                        SecureSession.save(context, result.token)
                    } catch (_: Exception) {
                        // Keystore failure: the session still works until the app is closed.
                    }
                    authError = ""
                    token = result.token
                    screen = AppScreen.Client
                }
            }
        )
    }
}
