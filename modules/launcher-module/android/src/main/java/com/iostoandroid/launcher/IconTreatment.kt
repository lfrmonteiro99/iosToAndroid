package com.iostoandroid.launcher

/**
 * Pure-JVM policy for #486: whether the squircle mask (#480) should be
 * applied to a given icon. Kept free of android.graphics.* imports — data in,
 * boolean out — so it is unit-testable without a device; LauncherModule
 * decides whether the source drawable is an AdaptiveIconDrawable and calls
 * [shouldMask] before ever touching a Canvas.
 */
object IconTreatment {
    const val MASK_ALL = "mask-all"
    const val MASK_ADAPTIVE_ONLY = "mask-adaptive-only"
    const val NONE = "none"

    /** Matches SettingsStore.DEFAULT_SETTINGS.iconTreatment on the JS side. */
    const val DEFAULT = MASK_ADAPTIVE_ONLY

    /**
     * [isAdaptive] icons are composed by LauncherModule.composeAdaptiveIcon
     * with a clean background/foreground split, so masking them never crops a
     * visible edge. Non-adaptive icons are whatever silhouette the OS already
     * drew — already circular, a banner, or square — and masking those crops
     * visible corners empty; 'mask-adaptive-only' exists to leave those alone.
     * An unrecognized treatment string falls back to [DEFAULT]'s behaviour
     * rather than silently masking (or not) everything.
     */
    fun shouldMask(isAdaptive: Boolean, treatment: String): Boolean = when (treatment) {
        MASK_ALL -> true
        NONE -> false
        MASK_ADAPTIVE_ONLY -> isAdaptive
        else -> if (DEFAULT == MASK_ADAPTIVE_ONLY) isAdaptive else true
    }
}
