package com.workstudio.mobile

import android.content.Intent
import android.net.Uri
import android.util.Patterns
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Client-side checks mirror the backend rules; the server still validates everything. */
internal object AuthValidation {
    fun email(value: String): String? =
        if (Patterns.EMAIL_ADDRESS.matcher(value.trim()).matches()) null else "Enter a valid email address."

    fun registration(name: String, email: String, password: String, confirm: String): String? = when {
        name.isBlank() -> "Enter your name."
        name.trim().length > 100 -> "Name must be at most 100 characters."
        email(email) != null -> email(email)
        password.length < 8 -> "Password must be at least 8 characters."
        password.toByteArray(Charsets.UTF_8).size > 72 -> "Password is too long (maximum 72 bytes)."
        password != confirm -> "Passwords do not match."
        else -> null
    }
}

@Composable
private fun AuthLayout(body: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().background(WorkColors.Background)
            .verticalScroll(rememberScrollState()).imePadding()
            .padding(horizontal = 24.dp, vertical = 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        content = {
            Text("WorkStudio", fontSize = 25.sp, fontWeight = FontWeight.Bold, color = Color.Black)
            Text("Your workspace, your way", fontSize = 12.sp, color = Color.DarkGray)
            body()
        }
    )
}

@Composable
private fun AuthField(
    label: String, value: String, onChange: (String) -> Unit, enabled: Boolean,
    placeholder: String? = null, password: Boolean = false, keyboard: KeyboardType = KeyboardType.Text
) {
    Text(label, fontWeight = FontWeight.Medium, color = Color.Black, modifier = Modifier.fillMaxWidth())
    Spacer(Modifier.height(8.dp))
    OutlinedTextField(
        value = value, onValueChange = onChange, enabled = enabled, singleLine = true,
        placeholder = if (placeholder != null) { { Text(placeholder) } } else null,
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboard, imeAction = ImeAction.Next),
        shape = RoundedCornerShape(6.dp), modifier = Modifier.fillMaxWidth()
    )
}

@Composable
internal fun LoginScreen(
    externalError: String,
    onSignUp: () -> Unit,
    onBrowseAsGuest: () -> Unit,
    onLoginSuccess: (WorkApi.LoginResult) -> Unit
) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    AuthLayout {
        Spacer(Modifier.height(48.dp))
        Text("Welcome back!", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.Black, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Text("Sign in to continue to WorkStudio", fontSize = 14.sp, color = Color.DarkGray, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(32.dp))
        AuthField("Email address", email, { email = it }, !loading, "you@gmail.com", keyboard = KeyboardType.Email)
        Spacer(Modifier.height(20.dp))
        AuthField("Password", password, { password = it }, !loading, password = true)
        Spacer(Modifier.height(12.dp))
        Text("Forgot password?", color = WorkColors.Blue, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.align(Alignment.End).clickable { message = "Password recovery is not supported yet." })
        Spacer(Modifier.height(36.dp))
        PrimaryButton("Sign In", loading = loading, onClick = {
            val problem = AuthValidation.email(email) ?: if (password.isEmpty()) "Enter your password." else null
            if (problem != null) { message = problem; return@PrimaryButton }
            loading = true
            message = ""
            scope.launch {
                try {
                    onLoginSuccess(WorkApi.login(email.trim(), password))
                } catch (e: CancellationException) { throw e }
                catch (e: Exception) { message = e.userMessage() }
                finally { loading = false }
            }
        })
        val shown = message.ifBlank { externalError }
        if (shown.isNotBlank()) {
            Spacer(Modifier.height(14.dp))
            Text(shown, color = WorkColors.Red, fontSize = 13.sp, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(24.dp))
        Text("OR", color = Color.Gray)
        Spacer(Modifier.height(18.dp))
        OutlinedButton(
            onClick = { message = "Google sign-in is not supported yet." }, enabled = !loading,
            shape = ButtonShape, modifier = Modifier.fillMaxWidth().height(50.dp)
        ) { Text("Continue with Google", color = Color.Black) }
        Spacer(Modifier.height(14.dp))
        TextButton(onClick = onBrowseAsGuest, enabled = !loading) { Text("Browse workspaces as a guest", color = WorkColors.Blue) }
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Don't have an account? ", fontSize = 13.sp)
            Text("Sign Up", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = WorkColors.Blue,
                modifier = Modifier.clickable(enabled = !loading, onClick = onSignUp))
        }
    }
}

@Composable
internal fun RegisterScreen(onBackToLogin: () -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var registered by rememberSaveable { mutableStateOf(false) }
    var verificationUrl by rememberSaveable { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val editable = !loading && !registered

    AuthLayout {
        Spacer(Modifier.height(40.dp))
        Text("Create account", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.Black, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Text("Join WorkStudio and book your workspace", fontSize = 14.sp, color = Color.DarkGray, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(28.dp))
        AuthField("Full name", name, { name = it }, editable)
        Spacer(Modifier.height(16.dp))
        AuthField("Email address", email, { email = it }, editable, "you@gmail.com", keyboard = KeyboardType.Email)
        Spacer(Modifier.height(16.dp))
        AuthField("Password", password, { password = it }, editable, password = true)
        Spacer(Modifier.height(16.dp))
        AuthField("Confirm password", confirm, { confirm = it }, editable, password = true)
        Spacer(Modifier.height(24.dp))
        PrimaryButton("Create Account", enabled = !registered, loading = loading, onClick = {
            val problem = AuthValidation.registration(name, email, password, confirm)
            if (problem != null) { message = problem; return@PrimaryButton }
            loading = true
            message = ""
            scope.launch {
                try {
                    verificationUrl = WorkApi.register(name.trim(), email.trim(), password)
                    registered = true
                    message = if (verificationUrl != null)
                        "Account created. Confirm your email with the link below, then sign in."
                    else "Account created. Confirm your email from the message we sent, then sign in."
                } catch (e: CancellationException) { throw e }
                catch (e: Exception) { message = e.userMessage() }
                finally { loading = false }
            }
        })
        if (message.isNotBlank()) {
            Spacer(Modifier.height(14.dp))
            Text(message, color = if (registered) WorkColors.DarkGreen else WorkColors.Red, fontSize = 13.sp, textAlign = TextAlign.Center)
        }
        verificationUrl?.let { url ->
            Spacer(Modifier.height(10.dp))
            SecondaryButton("Open verification link (demo server)", onClick = {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            })
        }
        if (registered) {
            Spacer(Modifier.height(10.dp))
            PrimaryButton("Go to Sign In", onClick = onBackToLogin)
        }
        Spacer(Modifier.height(26.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Already have an account? ", fontSize = 13.sp)
            Text("Sign In", color = WorkColors.Blue, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(onClick = onBackToLogin))
        }
    }
}
