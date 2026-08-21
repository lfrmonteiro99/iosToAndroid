package com.iostoandroid.launcher

/**
 * Pure-JVM mapping from an Android package broadcast to the payload the JS side
 * consumes ("added" | "removed" | "replaced" + packageName). Kept free of
 * android.* imports so the decision table can be unit-tested without a device
 * — same reasoning as [IconCache] and [PackageNameValidator].
 *
 * The subtleties this encodes:
 *  - ACTION_PACKAGE_REPLACED / EXTRA_REPLACING mean "reprocess this package",
 *    not "add" and definitely not "remove": an update fires REMOVED with
 *    EXTRA_REPLACING=true followed by ADDED, and treating the first as a real
 *    uninstall makes the app blink out of the grid mid-update.
 *  - Our own package must be ignored: the launcher receives PACKAGE_REPLACED
 *    for itself when it is updated, and there is nothing to refresh in a
 *    process that is being restarted anyway.
 */
object PackageChangeMapper {

    const val ACTION_ADDED = "android.intent.action.PACKAGE_ADDED"
    const val ACTION_REMOVED = "android.intent.action.PACKAGE_REMOVED"
    const val ACTION_REPLACED = "android.intent.action.PACKAGE_REPLACED"

    data class Change(val action: String, val packageName: String)

    /**
     * @param action the broadcast action
     * @param packageName the package the broadcast refers to (from the intent data)
     * @param isReplacing the EXTRA_REPLACING flag of the broadcast
     * @param ownPackageName this app's own package name
     * @return the payload to emit, or null when the event should be dropped
     */
    fun map(
        action: String?,
        packageName: String?,
        isReplacing: Boolean,
        ownPackageName: String,
    ): Change? {
        if (packageName.isNullOrBlank()) return null
        if (packageName == ownPackageName) return null
        return when (action) {
            ACTION_REPLACED -> Change("replaced", packageName)
            ACTION_ADDED -> Change(if (isReplacing) "replaced" else "added", packageName)
            // A REMOVED with EXTRA_REPLACING is the first half of an update; the
            // matching ADDED/REPLACED right after is what carries the new entry.
            ACTION_REMOVED -> if (isReplacing) null else Change("removed", packageName)
            else -> null
        }
    }
}
