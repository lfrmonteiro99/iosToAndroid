package com.iostoandroid.launcher

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent

/**
 * #627 child issue — native foreground-app monitor + Protected-Apps gate.
 *
 * An AccessibilityService is the only API surface (short of device-admin /
 * root) that observes the foreground app globally, so it can gate apps the JS
 * launcher never launches: the system recent-apps list, share sheets, deep
 * links. The gate is the same BiometricPrompt used by the in-launcher flow.
 *
 * Design notes (no absolute control, by design — see the issue):
 *  - We CANNOT prevent the OS from showing the app. What we do is, the moment a
 *    protected package reaches the foreground, launch a transparent
 *    [ForegroundGuardActivity] that hosts a BiometricPrompt. If it is
 *    cancelled/failed we bounce the user back HOME. The native layer has no
 *    app-kill authority; that back-to-HOME is the closest to "not releasing"
 *    we get on a non-rooted device.
 *  - The protected set is owned by JS (AppsStore) and pushed via
 *    LauncherModule.setProtectedApps -> [LauncherModule.protectedApps].
 *  - Self-transitions (our own package) and the launcher's own foreground are
 *    never gated — gating ourselves would lock the launcher out.
 */
class ForegroundMonitorService : AccessibilityService() {

    companion object {
        var instance: ForegroundMonitorService? = null
        private const val OWN_PACKAGE = "com.iostoandroid.launcher"
        /** Passed to the guard activity so it can label the prompt. */
        const val EXTRA_PACKAGE = "com.iostoandroid.launcher.EXTRA_PACKAGE"
    }

    private var lastPackage: String? = null

    override fun onServiceConnected() {
        instance = this
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
        }
        serviceInfo = info
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val pkg = event.packageName?.toString() ?: return
        // De-dupe consecutive events for the same package — Accessibility fires
        // several WINDOW_STATE_CHANGED for one transition.
        if (pkg == lastPackage) return
        lastPackage = pkg

        // Emit to JS so the launcher UI can react / log the transition.
        try {
            val bundle = Bundle().apply { putString("packageName", pkg) }
            LauncherModule.emitEvent("onForegroundAppChanged", bundle)
        } catch (_: Throwable) { /* bridge may be down */ }

        if (pkg == OWN_PACKAGE) return
        if (!LauncherModule.protectedApps.contains(pkg)) return

        // Launch the transparent guard activity that hosts the BiometricPrompt.
        val intent = Intent(this, ForegroundGuardActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)
            putExtra(EXTRA_PACKAGE, pkg)
        }
        try {
            startActivity(intent)
        } catch (_: Throwable) { /* best effort */ }
    }

    override fun onInterrupt() { /* no-op */ }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }
}
