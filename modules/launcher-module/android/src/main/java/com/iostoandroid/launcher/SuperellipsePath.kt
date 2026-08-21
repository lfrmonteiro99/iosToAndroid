package com.iostoandroid.launcher

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sign
import kotlin.math.sin

/**
 * Pure-JVM superellipse geometry generator. Mirrors src/theme/squircle.ts
 * (superellipsePath) so the native Kotlin icon mask and the TS/SVG reference
 * share the exact same formula. Kept free of android.* imports so it can be
 * unit-tested without a device or the Android SDK.
 *
 * Superellipse equation: |x/a|^n + |y/b|^n = 1.
 *
 * Coordinates are sampled at [segments] equidistant angles and returned in the
 * same pixel space the SVG reference uses: a [size]×[size] box centered at
 * (size/2, size/2). LauncherModule.applySquircleMask converts these points
 * straight into an android.graphics.Path, so this generator is the single
 * source of truth for the silhouette on both sides of the bridge.
 */
object SuperellipsePath {

    /**
     * Sample points of the superellipse in a [size]×[size] box.
     * @param size edge length of the bounding box (px)
     * @param n superellipse exponent (4.7 ≈ iOS icon corners)
     * @param segments number of sample points
     * @return [size] point pairs (x, y), ordered by angle
     */
    fun points(size: Int, n: Double = 4.7, segments: Int = 64): List<Pair<Double, Double>> {
        val a = size / 2.0
        val b = size / 2.0
        val center = size / 2.0
        val out = ArrayList<Pair<Double, Double>>(segments)
        for (i in 0 until segments) {
            val angle = (i.toDouble() / segments) * 2.0 * PI
            val x = a * signedPow(cos(angle), 2.0 / n)
            val y = b * signedPow(sin(angle), 2.0 / n)
            out.add(Pair(center + x, center + y))
        }
        return out
    }

    /** Signed power: preserves the sign of [base] for fractional [exp]. */
    private fun signedPow(base: Double, exp: Double): Double =
        sign(base) * Math.pow(Math.abs(base), exp)
}
