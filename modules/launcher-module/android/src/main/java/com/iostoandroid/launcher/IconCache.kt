package com.iostoandroid.launcher

/**
 * Pure-JVM logic for LauncherModule's on-disk icon cache. Kept free of
 * android.* imports so it can be unit-tested without a device.
 *
 * Icons are cached as `<packageName>_<versionCode>_<shapeKey>.png` under
 * `context.filesDir/icons/`. Folding versionCode into the key means an app
 * update invalidates its icon for free — the old file simply stops matching
 * any currently-installed package and [orphanedFiles] flags it for deletion.
 * Folding the shape key in does the same for the icon-shape setting (#482):
 * change the shape or the squircle exponent and the previously masked PNGs stop
 * matching, so the grid re-renders instead of serving the old shape.
 */
object IconCache {

    /** Shape key used when the caller did not specify one (default squircle, n=4.7). */
    const val DEFAULT_SHAPE_KEY = "squircle4.7"

    /**
     * The cache filename for [packageName] at [versionCode], masked with
     * [shapeKey] (#482) and rendered under [treatment] (#486 —
     * mask-all/mask-adaptive-only/none, see [IconTreatment]). Both are folded
     * into the key: changing the shape, the exponent or the treatment in
     * Settings orphans the existing PNGs for free, the same way an app update
     * already does via versionCode — no separate "invalidate" step needed.
     * Characters that are not filename-safe are stripped from BOTH keys so a
     * malformed value from JS cannot escape the icons directory.
     */
    fun fileName(
        packageName: String,
        versionCode: Long,
        shapeKey: String = DEFAULT_SHAPE_KEY,
        treatment: String = IconTreatment.DEFAULT
    ): String = "${packageName}_${versionCode}_${sanitizeShapeKey(shapeKey)}_${sanitizeShapeKey(treatment)}.png"

    /** Keeps letters, digits, dots and dashes; everything else becomes '-'. */
    fun sanitizeShapeKey(shapeKey: String): String {
        val cleaned = shapeKey.map { c ->
            if (c.isLetterOrDigit() || c == '.' || c == '-') c else '-'
        }.joinToString("")
        return if (cleaned.isEmpty()) DEFAULT_SHAPE_KEY else cleaned
    }

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
