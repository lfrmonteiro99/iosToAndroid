package com.iostoandroid.launcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle

/**
 * Receives package install / uninstall / update broadcasts and forwards them to
 * JS as the "onPackageChanged" event, so the launcher grid and the App Library
 * stay in sync without restarting the process (#485).
 *
 * Registered dynamically by [LauncherModule] (OnCreate/OnDestroy), never in the
 * manifest: since API 26 implicit package broadcasts are not delivered to
 * manifest-declared receivers.
 *
 * The action → payload decision (including ignoring our own package and the
 * REMOVED-while-replacing half of an update) lives in [PackageChangeMapper].
 */
class PackageChangeReceiver : BroadcastReceiver() {

    override fun onReceive(ctx: Context?, intent: Intent?) {
        val context = ctx ?: return
        val change = PackageChangeMapper.map(
            action = intent?.action,
            packageName = intent?.data?.schemeSpecificPart,
            isReplacing = intent?.getBooleanExtra(Intent.EXTRA_REPLACING, false) ?: false,
            ownPackageName = context.packageName,
        ) ?: return

        LauncherModule.emitEvent(
            "onPackageChanged",
            Bundle().apply {
                putString("action", change.action)
                putString("packageName", change.packageName)
            }
        )
    }

    companion object {
        private var receiver: PackageChangeReceiver? = null
        private var registeredContext: Context? = null

        fun register(context: Context) {
            if (receiver != null) return
            val r = PackageChangeReceiver()
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_PACKAGE_ADDED)
                addAction(Intent.ACTION_PACKAGE_REMOVED)
                addAction(Intent.ACTION_PACKAGE_REPLACED)
                // Without a "package" data scheme the filter never matches these
                // actions — the broadcasts carry the package as intent data.
                addDataScheme("package")
            }
            try {
                context.applicationContext.registerReceiver(r, filter)
                receiver = r
                registeredContext = context.applicationContext
            } catch (_: Exception) { /* already registered or unsupported */ }
        }

        fun unregister(context: Context) {
            val r = receiver ?: return
            try {
                (registeredContext ?: context.applicationContext).unregisterReceiver(r)
            } catch (_: Exception) { /* not registered */ }
            receiver = null
            registeredContext = null
        }
    }
}
