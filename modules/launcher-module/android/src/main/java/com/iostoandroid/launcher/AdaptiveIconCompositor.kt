package com.iostoandroid.launcher

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/**
 * Pure-JVM geometry for composing an AdaptiveIconDrawable (#484): the
 * squircle mask boundary for the background layer, and the centered bounds
 * for the scaled-down foreground layer. Kept free of android.graphics.*
 * imports so it can be unit-tested without a device — LauncherModule turns
 * these points into an android.graphics.Path and draws with a real Canvas.
 */
object AdaptiveIconCompositor {

    /**
     * Foreground is scaled to this fraction of the icon canvas and centered.
     * 0.72 is the inverse of Android's adaptive-icon safe zone, which reserves
     * 72/108 of the 108x108 canvas as the area guaranteed visible after any
     * OEM mask crops the rest.
     */
    const val FOREGROUND_SCALE = 0.72f

    /**
     * Default squircle exponent for the background mask. 5.0 is the commonly
     * cited superellipse approximation of Apple's continuous corner (the true
     * iOS silhouette is a variable-radius curve, not a pure superellipse, but
     * n=5 lands closest). Matches the default that issue #482 (icon-shape
     * settings) exposes as a user-configurable value.
     */
    const val DEFAULT_SQUIRCLE_EXPONENT = 5.0

    private const val DEFAULT_SAMPLES = 64

    data class ForegroundBounds(val offset: Int, val scaledSize: Int)

    /**
     * Boundary points of a superellipse |x/r|^n + |y/r|^n = 1 inscribed in a
     * [size] x [size] square, returned in canvas coordinates (origin top-left).
     * n=2 traces a circle; higher n hugs the square's corners more tightly
     * (the "squircle" look); n→∞ approaches a plain square.
     */
    fun squirclePoints(
        size: Float,
        exponent: Double = DEFAULT_SQUIRCLE_EXPONENT,
        samples: Int = DEFAULT_SAMPLES
    ): List<Pair<Float, Float>> {
        require(size > 0f) { "size must be positive, got $size" }
        require(exponent > 0.0) { "exponent must be positive, got $exponent" }
        require(samples >= 3) { "samples must be at least 3, got $samples" }

        val radius = size / 2f
        val curvePower = 2.0 / exponent
        return (0 until samples).map { i ->
            val t = 2.0 * Math.PI * i / samples
            val x = radius + radius * signedPow(cos(t), curvePower)
            val y = radius + radius * signedPow(sin(t), curvePower)
            x.toFloat() to y.toFloat()
        }
    }

    /** Bounds for a [scale]-sized square centered within a [size] x [size] canvas. */
    fun foregroundBounds(size: Int, scale: Float = FOREGROUND_SCALE): ForegroundBounds {
        require(size > 0) { "size must be positive, got $size" }
        require(scale > 0f && scale <= 1f) { "scale must be in (0, 1], got $scale" }

        val scaledSize = (size * scale).toInt()
        val offset = (size - scaledSize) / 2
        return ForegroundBounds(offset, scaledSize)
    }

    /** [value]^[exponent], preserving [value]'s sign — plain Math.pow rejects negative bases. */
    private fun signedPow(value: Double, exponent: Double): Double {
        val sign = if (value < 0.0) -1.0 else 1.0
        return sign * abs(value).pow(exponent)
    }
}
