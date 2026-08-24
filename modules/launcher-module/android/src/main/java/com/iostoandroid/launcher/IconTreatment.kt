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

    /**
     * Default = MASK_ALL so every icon (adaptive OR non-adaptive) shares one
     * silhouette, exactly like iOS — which masks ALL icons with the same
     * continuous squircle. 'mask-adaptive-only' (the old default) left most
     * installed apps square, which is the opposite of iOS.
     * Matches SettingsStore.DEFAULT_SETTINGS.iconTreatment on the JS side.
     */
    const val DEFAULT = MASK_ALL

    /**
     * [isAdaptive] icons are composed by LauncherModule.composeAdaptiveIcon
     * with a clean background/foreground split, so masking them never crops a
     * visible edge. Non-adaptive icons are whatever silhouette the OS already
     * drew — already circular, a banner, or square — and masking those crops
     * visible corners empty; with MASK_ALL those empty corners are now filled
     * by the dominant-colour backfill (see LauncherModule) so the silhouette
     * stays intact. An unrecognized treatment string falls back to [DEFAULT]'s
     * behaviour rather than silently masking (or not) everything.
     */
    fun shouldMask(isAdaptive: Boolean, treatment: String): Boolean = when (treatment) {
        MASK_ALL -> true
        NONE -> false
        MASK_ADAPTIVE_ONLY -> isAdaptive
        else -> DEFAULT == MASK_ALL
    }
}
