package com.iostoandroid.launcher

import android.content.pm.ApplicationInfo

/**
 * Maps ApplicationInfo.category integer constants to stable string labels.
 * Used by getInstalledApps to expose app category metadata to JavaScript.
 */
object CategoryMapper {
    const val UNDEFINED = "undefined"

    /**
     * Whether `ApplicationInfo.category` can be READ on this device.
     *
     * The field was added in API 26 (O) and this module ships with
     * `minSdkVersion 24`, so on API 24/25 the field does not exist at runtime and
     * touching it throws `NoSuchFieldError` — which rejects the whole
     * `getInstalledApps` promise and leaves the launcher with no apps at all.
     *
     * The check lives here, as a pure function of the SDK level, so it can be
     * unit-tested without an Android runtime. The CALL SITE still has to do the
     * guarding: the crash happens on field access, so `appInfo.category` must not
     * be evaluated at all below API 26.
     */
    fun isCategoryReadable(sdkInt: Int): Boolean = sdkInt >= 26 // Build.VERSION_CODES.O

    fun categoryToString(categoryValue: Int): String {
        return when (categoryValue) {
            ApplicationInfo.CATEGORY_UNDEFINED -> "undefined"
            ApplicationInfo.CATEGORY_GAME -> "game"
            ApplicationInfo.CATEGORY_AUDIO -> "audio"
            ApplicationInfo.CATEGORY_VIDEO -> "video"
            ApplicationInfo.CATEGORY_IMAGE -> "image"
            ApplicationInfo.CATEGORY_SOCIAL -> "social"
            ApplicationInfo.CATEGORY_NEWS -> "news"
            ApplicationInfo.CATEGORY_MAPS -> "maps"
            ApplicationInfo.CATEGORY_PRODUCTIVITY -> "productivity"
            8 -> "accessibility" // CATEGORY_ACCESSIBILITY value (API 31+)
            else -> "undefined"
        }
    }
}
