package com.iostoandroid.launcher

/**
 * Pure-JVM validation for package names passed to [LauncherModule.launchApp].
 * Kept free of android.* imports so it can be unit-tested without a device.
 */
object PackageNameValidator {
    val PKG_REGEX = Regex("^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+\$")

    /** True when [packageName] is a plausible Java/Android package identifier. */
    fun isValidShape(packageName: String): Boolean = PKG_REGEX.matches(packageName)

    /**
     * Resolves [packageName] through [resolve] only when it passes the shape
     * check; returns null otherwise. [resolve] is the whitelist lookup
     * (e.g. PackageManager.getLaunchIntentForPackage) — kept as a parameter so
     * this stays pure-JVM testable.
     */
    fun <T> resolveIfValidShape(packageName: String, resolve: (String) -> T?): T? {
        if (!isValidShape(packageName)) return null
        return resolve(packageName)
    }
}
