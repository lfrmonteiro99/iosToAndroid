package com.iostoandroid.launcher

import android.content.pm.ApplicationInfo

/**
 * Maps ApplicationInfo.category integer constants to stable string labels.
 * Used by getInstalledApps to expose app category metadata to JavaScript.
 */
object CategoryMapper {
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
