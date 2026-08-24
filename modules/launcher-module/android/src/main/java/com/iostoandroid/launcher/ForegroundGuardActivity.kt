package com.iostoandroid.launcher

import android.content.Intent
import android.os.Bundle
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt

/**
 * #627 child issue — transparent host for the Protected-Apps BiometricPrompt.
 *
 * An AccessibilityService has no Activity to attach a BiometricPrompt to, and a
 * prompt needs a UI window — so [ForegroundMonitorService] launches THIS
 * activity (theme = transparent, no history) the moment a protected package
 * hits the foreground. The activity is invisible; only the system biometric
 * sheet it hosts is seen.
 *
 * Fail-closed: any error, cancellation, or missing enrollment → go HOME and
 * finish. Success → just finish, letting the (already foreground) app stay.
 * The activity never "approves" the app itself — absence of a cancelled prompt
 * is the approval.
 */
// AppCompatActivity (FragmentActivity) is required: android.app.Activity cannot
// host a BiometricPrompt (its only constructors take FragmentActivity/Fragment),
// which is what broke assembleRelease on every PR merge (#805).
class ForegroundGuardActivity : AppCompatActivity() {

    companion object {
        private const val OWN_PACKAGE = "com.iostoandroid.launcher"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // No visible content — the window is fully transparent (see styles). The
        // biometric prompt draws on top of whatever app is in the foreground.
        setContentView(FrameLayout(this))

        // Back must behave like "cancel" — go HOME, never release. (AppCompatActivity
        // finalizes onBackPressed(), so we register a dispatcher callback instead.)
        onBackPressedDispatcher.addCallback(this) {
            goHome()
            finish()
        }

        val packageName = intent?.getStringExtra(ForegroundMonitorService.EXTRA_PACKAGE)
        if (packageName.isNullOrEmpty() || packageName == OWN_PACKAGE) {
            // Nothing to gate (or self) — never block.
            finish()
            return
        }

        val canAuth = runCatching {
            BiometricManager.from(this).canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
                    or BiometricManager.Authenticators.BIOMETRIC_WEAK
            ) == BiometricManager.BIOMETRIC_SUCCESS
        }.getOrDefault(false)

        if (!canAuth) {
            // No biometric enrolled — cannot verify identity, so do NOT leave the
            // user staring at a dead-end sheet. Bounce to HOME.
            goHome()
            finish()
            return
        }

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Protected App")
            .setDescription("Unlock ${labelFor(packageName)}")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
                    or BiometricManager.Authenticators.BIOMETRIC_WEAK
            )
            .setNegativeButtonText("Cancel")
            .build()

        val biometricPrompt = BiometricPrompt(this,
            mainExecutor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    // Approved — let the foreground app stay, just dismiss the sheet.
                    finish()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    // Cancelled / failed / too many attempts → do not release.
                    // Back to HOME; the user can retry from the launcher.
                    goHome()
                    finish()
                }

                override fun onAuthenticationFailed() {
                    // Wrong biometric presented — keep prompting until the user
                    // succeeds or cancels (which routes through onAuthenticationError).
                }
            })

        try {
            biometricPrompt.authenticate(promptInfo)
        } catch (_: Throwable) {
            goHome()
            finish()
        }
    }

    private fun goHome() {
        val intent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        try { startActivity(intent) } catch (_: Throwable) { /* best effort */ }
    }

    private fun labelFor(packageName: String): String {
        return runCatching {
            val pm = packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
        }.getOrDefault(packageName)
    }
}
