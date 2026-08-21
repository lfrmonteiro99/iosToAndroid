package com.iostoandroid.launcher

/**
 * Pure-JVM logic for LauncherModule's on-disk icon cache. Kept free of
 * android.* imports so it can be unit-tested without a device.
 *
 * Icons are cached as `<packageName>_<versionCode>.png` under
 * `context.filesDir/icons/`. Folding versionCode into the key means an app
 * update invalidates its icon for free — the old file simply stops matching
 * any currently-installed package and [orphanedFiles] flags it for deletion.
 */
object IconCache {

    /** The cache filename for [packageName] at [versionCode]. */
    fun fileName(packageName: String, versionCode: Long): String = "${packageName}_$versionCode.png"

    /**
     * Names, from [existingFileNames], that no longer correspond to any name in
     * [validFileNames] — i.e. the app was uninstalled, or was updated to a
     * versionCode whose icon has already been (re-)cached under a new key.
     * Callers should delete these from disk so `filesDir` doesn't grow forever.
     */
    fun orphanedFiles(existingFileNames: List<String>, validFileNames: Set<String>): List<String> =
        existingFileNames.filterNot { validFileNames.contains(it) }
}
