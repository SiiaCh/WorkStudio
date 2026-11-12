
package com.workstudio.mobile

import android.os.Bundle
import android.content.Intent
import android.net.Uri
import android.util.Patterns
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val WorkBlue = Color(0xFF2E619C)
private val WorkBackground = Color(0xFFF8F9FB)
private val WorkError = Color(0xFFAF2626)
private val WorkGreen = Color(0xFF166534)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                var screen by remember { mutableStateOf("loading") }
                var accessToken by remember { mutableStateOf<String?>(null) }
                var authError by remember { mutableStateOf("") }
                val scope = rememberCoroutineScope()
                val context = this@MainActivity

                // Restore an encrypted token and check its live server session.
                LaunchedEffect(Unit) {
                    val saved = withContext(Dispatchers.IO) { SecureSession.load(context) }
                    if (saved != null) {
                        try {
                            val user = withContext(Dispatchers.IO) {
                                StudioApi.get("/auth/me", saved).getJSONObject("user")
                            }
                            if (user.optString("role") == "CLIENT") {
                                accessToken = saved
                                screen = "home"
                            } else {
                                SecureSession.clear(context)
                                authError = "Цей мобільний інтерфейс призначено для клієнтів."
                                screen = "login"
                            }
                        } catch (e: StudioApi.ApiException) {
                            if (e.status == 401 || e.status == 403) {
                                SecureSession.clear(context)
                            }
                            authError = "Перевірка сесії: ${e.message}"
                            screen = "login"
                        } catch (_: Exception) {
                            // Keep the encrypted token when the server is temporarily offline.
                            // Reopening the app while online can restore the session.
                            authError = "Немає з’єднання з сервером. Увімкніть backend та відкрийте застосунок знову."
                            screen = "login"
                        }
                    } else screen = "login"
                }

                BackHandler(enabled = screen == "register" || screen == "guest") { screen = "login" }
                BackHandler(enabled = screen == "home") { /* Stay in the authenticated area. */ }

                when (screen) {
                    "loading" -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                    "register" -> RegisterScreen(onBackToLogin = { screen = "login" })
                    "guest" -> WorkspaceScreen(
                        accessToken = null,
                        onLogout = { screen = "login" },
                        onLoginRequested = { screen = "login" }
                    )
                    "home" -> {
                        val current = accessToken
                        if (current != null) WorkspaceScreen(
                            accessToken = current,
                            onLogout = {
                                SecureSession.clear(context)
                                accessToken = null
                                screen = "login"
                            }
                        )
                    }
                    else -> LoginScreen(
                        onSignUp = { authError = ""; screen = "register" },
                        onBrowseAsGuest = { authError = ""; screen = "guest" },
                        externalError = authError,
                        onLoginSuccess = { token ->
                            authError = ""
                            screen = "loading"
                            scope.launch {
                                try {
                                    val user = withContext(Dispatchers.IO) {
                                        StudioApi.get("/auth/me", token).getJSONObject("user")
                                    }
                                    if (user.optString("role") != "CLIENT") {
                                        authError = "Доступ до клієнтської мобілки лише для CLIENT."
                                        screen = "login"
                                    } else {
                                        withContext(Dispatchers.IO) { SecureSession.save(context, token) }
                                        accessToken = token
                                        screen = "home"
                                    }
                                } catch (e: Exception) {
                                    authError = e.localizedMessage ?: "Не вдалося перевірити сесію"
                                    screen = "login"
                                }
                            }
                        }
                    )
                }
            }
        }
    }
}

// =====================================
// LOGIN SCREEN
// =====================================

@Composable
fun LoginScreen(
    onSignUp: () -> Unit,
    onBrowseAsGuest: () -> Unit,
    externalError: String = "",
    onLoginSuccess: (String) -> Unit
) {

    var email by remember {
        mutableStateOf("")
    }

    var password by remember {
        mutableStateOf("")
    }

    var message by remember {
        mutableStateOf("")
    }

    var loading by remember {
        mutableStateOf(false)
    }

    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(WorkBackground)
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(
                horizontal = 24.dp,
                vertical = 36.dp
            ),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {

        WorkStudioHeader()

        Spacer(Modifier.height(48.dp))

        Text(
            text = "Welcome back!",
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
            color = Color.Black,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text = "Sign in to continue to WorkStudio",
            fontSize = 14.sp,
            color = Color.DarkGray,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(32.dp))

        WorkInputLabel("Email address")

        OutlinedTextField(
            value = email,
            onValueChange = {
                email = it
            },
            enabled = !loading,
            placeholder = {
                Text("you@gmail.com")
            },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email
            ),
            singleLine = true,
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(20.dp))

        WorkInputLabel("Password")

        OutlinedTextField(
            value = password,
            onValueChange = {
                password = it
            },
            enabled = !loading,
            visualTransformation =
                PasswordVisualTransformation(),
            singleLine = true,
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(12.dp))

        Text(
            text = "Forgot password?",
            color = WorkBlue,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .align(Alignment.End)
                .clickable {
                    message =
                        "Відновлення пароля ще не підключено"
                }
        )

        Spacer(Modifier.height(42.dp))

        Button(
            onClick = {

                when {

                    !Patterns.EMAIL_ADDRESS
                        .matcher(email.trim())
                        .matches() -> {

                        message = "Введіть правильний email"
                    }

                    password.isBlank() -> {

                        message = "Введіть пароль"
                    }

                    !loading -> {

                        loading = true
                        message = ""

                        scope.launch {

                            try {

                                val result = withContext(
                                    Dispatchers.IO
                                ) {
                                    WorkApi.login(
                                        email.trim(),
                                        password
                                    )
                                }

                                result.onSuccess { response ->

                                    val data =
                                        response.optJSONObject("data")

                                    val token =
                                        data?.optString("accessToken")
                                            .orEmpty()

                                    if (token.isNotBlank()) {

                                        onLoginSuccess(token)

                                    } else {

                                        message =
                                            "Сервер не повернув токен"
                                    }
                                }

                                result.onFailure { error ->

                                    message =
                                        error.localizedMessage
                                            ?: "Помилка авторизації"
                                }

                            } catch (e: Exception) {

                                message =
                                    e.localizedMessage
                                        ?: "Помилка з'єднання"

                            } finally {

                                loading = false
                            }
                        }
                    }
                }
            },
            enabled = !loading,
            colors = ButtonDefaults.buttonColors(
                containerColor = WorkBlue
            ),
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
        ) {

            if (loading) {

                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(24.dp)
                )

            } else {

                Text(
                    text = "Sign In",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        if (message.isNotBlank()) {

            Spacer(Modifier.height(14.dp))

            Text(
                text = message,
                color = WorkError,
                fontSize = 13.sp,
                textAlign = TextAlign.Center
            )
        }

        if (externalError.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(externalError, color = WorkError, fontSize = 13.sp)
        }

        Spacer(Modifier.height(26.dp))

        Text(
            text = "OR",
            color = Color.Gray
        )

        Spacer(Modifier.height(20.dp))

        OutlinedButton(
            onClick = {
                message =
                    "Google Sign-In ще не підключено"
            },
            enabled = !loading,
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp)
        ) {

            Text(
                text = "Continue with Google",
                color = Color.Black
            )
        }

        Spacer(Modifier.height(14.dp))
        TextButton(
            onClick = onBrowseAsGuest,
            enabled = !loading
        ) { Text("Browse workspaces as a guest", color = WorkBlue) }

        Spacer(Modifier.height(18.dp))

        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {

            Text(
                text = "Don't have an account? ",
                fontSize = 13.sp
            )

            Text(
                text = "Sign Up",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = WorkBlue,
                modifier = Modifier.clickable(
                    enabled = !loading
                ) {
                    onSignUp()
                }
            )
        }
    }
}

// =====================================
// REGISTRATION SCREEN
// =====================================

@Composable
fun RegisterScreen(
    onBackToLogin: () -> Unit
) {

    var name by remember {
        mutableStateOf("")
    }

    var email by remember {
        mutableStateOf("")
    }

    var password by remember {
        mutableStateOf("")
    }

    var confirmPassword by remember {
        mutableStateOf("")
    }

    var message by remember {
        mutableStateOf("")
    }

    var loading by remember {
        mutableStateOf(false)
    }

    var registered by remember {
        mutableStateOf(false)
    }
    var verificationUrl by remember { mutableStateOf("") }
    val context = LocalContext.current

    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(WorkBackground)
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(
                horizontal = 24.dp,
                vertical = 36.dp
            ),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {

        WorkStudioHeader()

        Spacer(Modifier.height(40.dp))

        Text(
            text = "Create account",
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
            color = Color.Black,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text = "Join WorkStudio and book your workspace",
            fontSize = 14.sp,
            color = Color.DarkGray,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(28.dp))

        WorkInputLabel("Full name")

        OutlinedTextField(
            value = name,
            onValueChange = {
                name = it
            },
            enabled = !loading && !registered,
            singleLine = true,
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(16.dp))

        WorkInputLabel("Email address")

        OutlinedTextField(
            value = email,
            onValueChange = {
                email = it
            },
            enabled = !loading && !registered,
            placeholder = {
                Text("you@gmail.com")
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email
            ),
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(16.dp))

        WorkInputLabel("Password")

        OutlinedTextField(
            value = password,
            onValueChange = {
                password = it
            },
            enabled = !loading && !registered,
            singleLine = true,
            visualTransformation =
                PasswordVisualTransformation(),
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(16.dp))

        WorkInputLabel("Confirm password")

        OutlinedTextField(
            value = confirmPassword,
            onValueChange = {
                confirmPassword = it
            },
            enabled = !loading && !registered,
            singleLine = true,
            visualTransformation =
                PasswordVisualTransformation(),
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = {

                when {

                    name.isBlank() -> {

                        message = "Введіть ім'я"
                    }

                    !Patterns.EMAIL_ADDRESS
                        .matcher(email.trim())
                        .matches() -> {

                        message = "Неправильний email"
                    }

                    password.length < 8 -> {

                        message =
                            "Пароль має містити мінімум 8 символів"
                    }

                    password != confirmPassword -> {

                        message = "Паролі не збігаються"
                    }

                    !loading && !registered -> {

                        loading = true
                        message = ""

                        scope.launch {

                            try {

                                val result = withContext(
                                    Dispatchers.IO
                                ) {
                                    WorkApi.register(
                                        name.trim(),
                                        email.trim(),
                                        password
                                    )
                                }

                                result.onSuccess { response ->
                                    registered = true
                                    verificationUrl = response.optJSONObject("data")
                                        ?.optJSONObject("emailDelivery")
                                        ?.optString("verificationUrl").orEmpty()
                                    message = if (verificationUrl.isNotBlank())
                                        "Акаунт створено. Підтвердьте email через dev-посилання нижче."
                                    else "Реєстрація успішна! Перевірте пошту для підтвердження."
                                }

                                result.onFailure { error ->

                                    message =
                                        error.localizedMessage
                                            ?: "Помилка реєстрації"
                                }

                            } catch (e: Exception) {

                                message =
                                    e.localizedMessage
                                        ?: "Помилка з'єднання"

                            } finally {

                                loading = false
                            }
                        }
                    }
                }
            },
            enabled = !loading && !registered,
            colors = ButtonDefaults.buttonColors(
                containerColor = WorkBlue
            ),
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
        ) {

            if (loading) {

                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(24.dp)
                )

            } else {

                Text(
                    text = "Create Account",
                    fontWeight = FontWeight.Bold
                )
            }
        }

        if (message.isNotBlank()) {

            Spacer(Modifier.height(14.dp))

            Text(
                text = message,
                color = if (registered) {
                    WorkGreen
                } else {
                    WorkError
                },
                fontSize = 13.sp,
                textAlign = TextAlign.Center
            )
        }

        if (verificationUrl.isNotBlank()) {
            Spacer(Modifier.height(10.dp))
            Button(onClick = {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(verificationUrl)))
            }, colors = ButtonDefaults.buttonColors(containerColor = WorkBlue)) {
                Text("Open verification link (dev only)")
            }
        }

        Spacer(Modifier.height(30.dp))

        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {

            Text(
                text = "Already have an account? ",
                fontSize = 13.sp
            )

            Text(
                text = "Sign In",
                color = WorkBlue,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable {
                    onBackToLogin()
                }
            )
        }
    }
}

// =====================================
// SHARED COMPONENTS
// =====================================

@Composable
private fun WorkStudioHeader() {

    Text(
        text = "WorkStudio",
        fontSize = 25.sp,
        fontWeight = FontWeight.Bold,
        color = Color.Black
    )

    Text(
        text = "Your workspace, your way",
        fontSize = 12.sp,
        color = Color.DarkGray
    )
}

@Composable
private fun WorkInputLabel(
    label: String
) {

    Text(
        text = label,
        fontWeight = FontWeight.Medium,
        color = Color.Black,
        modifier = Modifier.fillMaxWidth()
    )

    Spacer(Modifier.height(8.dp))
}
