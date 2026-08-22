package com.iostoandroid.launcher

/**
 * Pure-JVM parsing of the icon-mask argument JS passes to `getInstalledApps`,
 * `getAppInfo` and `getAppIcon` (#482). Kept free of android.* imports so it can
 * be unit-tested without a device.
 *
 * JS decides the shape (src/utils/iconShape.ts); the native side only applies
 * it. `exponent == null` means "no mask at all" — the `'original'` shape, where
 * the system drawable is returned untouched.
 */
data class IconMaskSpec(
    /** Superellipse exponent, or null for no mask ('original'). */
    val exponent: Double?,
    /** Segment folded into the on-disk cache filename. */
    val cacheKey: String
) {
    val hasMask: Boolean get() = exponent != null

    companion object {
        /** Default when JS sends nothing (older bundle against a newer binary). */
        val DEFAULT = IconMaskSpec(AdaptiveIconCompositor.DEFAULT_SQUIRCLE_EXPONENT, IconCache.DEFAULT_SHAPE_KEY)

        /** Useful range for the exponent; matches ICON_SHAPE_EXPONENT_MIN/MAX in JS. */
        const val MIN_EXPONENT = 2.0
        const val MAX_EXPONENT = 8.0

        /**
         * Builds a spec from the loosely-typed map the bridge delivers. A null or
         * malformed map falls back to [DEFAULT] rather than producing an
         * undefined mask; an out-of-range exponent is clamped, not rejected,
         * because an unmasked icon would be a bigger visual regression than a
         * slightly-off silhouette.
         *
         * Only `shape == "original"` yields a null exponent. A missing exponent
         * on any other shape is the default, never null — otherwise a partially
         * populated payload would silently disable masking everywhere.
         */
        fun from(raw: Map<String, Any?>?): IconMaskSpec {
            if (raw == null) return DEFAULT
            val shape = raw["shape"] as? String
            val cacheKey = (raw["cacheKey"] as? String)?.takeIf { it.isNotBlank() }
                ?: shape?.takeIf { it.isNotBlank() }
                ?: IconCache.DEFAULT_SHAPE_KEY
            if (shape == "original") return IconMaskSpec(null, cacheKey)
            val exponent = when (val e = raw["exponent"]) {
                is Number -> e.toDouble()
                else -> null
            }
            val safe = if (exponent == null || exponent.isNaN() || exponent.isInfinite()) {
                AdaptiveIconCompositor.DEFAULT_SQUIRCLE_EXPONENT
            } else {
                exponent.coerceIn(MIN_EXPONENT, MAX_EXPONENT)
            }
            return IconMaskSpec(safe, cacheKey)
        }
    }
}
