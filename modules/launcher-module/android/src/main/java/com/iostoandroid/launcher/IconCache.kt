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

    /**
     * The cache filename for [packageName] at [versionCode] under [treatment]
     * (#486 — mask-all/mask-adaptive-only/none, see [IconTreatment]). Folding
     * treatment into the key means changing it in Settings makes every
     * existing PNG orphaned for free, the same way an app update already
     * does via versionCode — no separate "invalidate" step needed.
     */
    fun fileName(packageName: String, versionCode: Long, treatment: String = IconTreatment.DEFAULT): String =
        "${packageName}_${versionCode}_$treatment.png"

    /**
     * Names, from [existingFileNames], that no longer correspond to any name in
     * [validFileNames] — i.e. the app was uninstalled, was updated to a
     * versionCode whose icon has already been (re-)cached under a new key, or
     * the icon treatment changed. Callers should delete these from disk so
     * `filesDir` doesn't grow forever.
     */
    fun orphanedFiles(existingFileNames: List<String>, validFileNames: Set<String>): List<String> =
        existingFileNames.filterNot { validFileNames.contains(it) }

    /** Sum of on-disk icon file sizes, for the cache-size row in Settings (#486). */
    fun totalSizeBytes(fileSizes: List<Long>): Long = fileSizes.sum()
}
