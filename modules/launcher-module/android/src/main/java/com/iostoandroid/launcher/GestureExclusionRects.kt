package com.iostoandroid.launcher

/**
 * Pure-JVM geometry for the system-gesture exclusion rect requested by
 * [SystemGestureExclusionView]. Kept free of android.* imports so it can be
 * unit-tested without a device (same pattern as [PhoneNumberValidator]).
 *
 * Android only honours ~200dp of exclusion height per edge and silently ignores
 * the excess (documented behaviour of `View.setSystemGestureExclusionRects`), so
 * there is no point asking for more than that: the returned rect is clamped to
 * [MAX_EXCLUSION_HEIGHT_DP] * density pixels, anchored at the TOP of the view.
 * Consequence, accepted per ESPECIFICACAO.md §6.4: on tall screens the lower
 * part of the left margin stays claimable by the system gesture.
 */
object GestureExclusionRects {
    /** Height, in dp, that Android is willing to exclude per edge. */
    const val MAX_EXCLUSION_HEIGHT_DP = 200

    /** A rect in view-local pixels: [left, top, right, bottom]. */
    data class Rect(val left: Int, val top: Int, val right: Int, val bottom: Int)

    /**
     * The rect to exclude for a view of [width] x [height] pixels at [density]
     * (pixels per dp). Returns `null` when there is nothing to exclude — a
     * zero/negative sized view, which happens during the first layout pass.
     */
    fun forView(width: Int, height: Int, density: Float): Rect? {
        if (width <= 0 || height <= 0) return null
        val safeDensity = if (density > 0f) density else 1f
        val maxPx = (MAX_EXCLUSION_HEIGHT_DP * safeDensity).toInt().coerceAtLeast(1)
        val bottom = if (height < maxPx) height else maxPx
        return Rect(0, 0, width, bottom)
    }
}
