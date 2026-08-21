package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Pure-JVM unit tests for [AdaptiveIconCompositor] — the squircle mask
 * geometry and the centered-foreground bounds used by
 * LauncherModule.drawableToBitmap when composing an AdaptiveIconDrawable
 * (#484). No android.* imports, so these run without a device or the
 * Android SDK.
 */
class AdaptiveIconCompositorTest {

    private val delta = 0.01

    // ── squirclePoints ───────────────────────────────────────────────────

    @Test
    fun `squirclePoints returns exactly the requested number of samples`() {
        val points = AdaptiveIconCompositor.squirclePoints(size = 100f, exponent = 4.7, samples = 40)
        assertEquals(40, points.size)
    }

    @Test
    fun `squirclePoints with exponent 2 traces a perfect circle`() {
        // n=2 collapses the superellipse formula to the classic circle
        // parametrization x=r*cos(t), y=r*sin(t) — an exact, checkable case.
        val size = 100f
        val radius = size / 2f
        val points = AdaptiveIconCompositor.squirclePoints(size = size, exponent = 2.0, samples = 8)

        // t=0 -> rightmost point of the circle
        val (x0, y0) = points[0]
        assertEquals((radius + radius).toDouble(), x0.toDouble(), delta)
        assertEquals(radius.toDouble(), y0.toDouble(), delta)

        // t=90deg (index 2 of 8 samples) -> bottom of the circle
        val (x2, y2) = points[2]
        assertEquals(radius.toDouble(), x2.toDouble(), delta)
        assertEquals((radius + radius).toDouble(), y2.toDouble(), delta)

        // t=45deg (index 1 of 8 samples) -> equal x/y offset from center, matching cos(45)=sin(45)
        val (x1, y1) = points[1]
        val expectedOffset = radius * (sqrt(2.0) / 2.0)
        assertEquals(radius + expectedOffset, x1.toDouble(), delta)
        assertEquals(radius + expectedOffset, y1.toDouble(), delta)
    }

    @Test
    fun `higher exponent hugs the corner more tightly than the default`() {
        // At the 45-degree diagonal, a higher exponent superellipse sits closer
        // to the square's corner than a lower exponent one — the defining
        // visual difference between a "squircle" and a "circle".
        val size = 100f
        val cornerDistance = { x: Float, y: Float ->
            val cx = size / 2f
            val cy = size / 2f
            sqrt(((x - cx) * (x - cx) + (y - cy) * (y - cy)).toDouble())
        }

        val lowExponentPoints = AdaptiveIconCompositor.squirclePoints(size, exponent = 2.0, samples = 8)
        val highExponentPoints = AdaptiveIconCompositor.squirclePoints(size, exponent = 20.0, samples = 8)

        // index 1 of 8 samples is the 45-degree diagonal point
        val (lx, ly) = lowExponentPoints[1]
        val (hx, hy) = highExponentPoints[1]

        assertTrue(
            "expected exponent=20 diagonal point closer to the square corner than exponent=2",
            cornerDistance(hx, hy) > cornerDistance(lx, ly)
        )
    }

    @Test
    fun `squirclePoints scales its extent with size, not a fixed offset`() {
        // Regression guard for the classic silent bug in these generators:
        // `radius + cos(t)^p` instead of `radius + radius*cos(t)^p` — the path
        // would still "exist" (right point count, right shape) but stop
        // growing with size. Doubling size must double the max distance from
        // the center to the boundary.
        val small = AdaptiveIconCompositor.squirclePoints(size = 100f, exponent = 4.7, samples = 32)
        val large = AdaptiveIconCompositor.squirclePoints(size = 200f, exponent = 4.7, samples = 32)

        fun maxDistanceFromCenter(points: List<Pair<Float, Float>>, size: Float): Double {
            val c = size / 2.0
            return points.maxOf { (x, y) -> sqrt((x - c) * (x - c) + (y - c) * (y - c)) }
        }

        val smallExtent = maxDistanceFromCenter(small, 100f)
        val largeExtent = maxDistanceFromCenter(large, 200f)

        assertEquals(2.0, largeExtent / smallExtent, 0.05)
    }

    @Test
    fun `squirclePoints stays within the size x size canvas bounds`() {
        val size = 128f
        val points = AdaptiveIconCompositor.squirclePoints(size, exponent = 4.7, samples = 64)
        points.forEach { (x, y) ->
            assertTrue("x=$x out of [0,$size]", x >= -delta && x <= size + delta)
            assertTrue("y=$y out of [0,$size]", y >= -delta && y <= size + delta)
        }
    }

    @Test
    fun `default exponent matches the value issue 482 will expose as a setting`() {
        assertEquals(4.7, AdaptiveIconCompositor.DEFAULT_SQUIRCLE_EXPONENT, delta)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `squirclePoints rejects non-positive size`() {
        AdaptiveIconCompositor.squirclePoints(size = 0f, exponent = 4.7, samples = 8)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `squirclePoints rejects fewer than 3 samples`() {
        AdaptiveIconCompositor.squirclePoints(size = 100f, exponent = 4.7, samples = 2)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `squirclePoints rejects non-positive exponent`() {
        AdaptiveIconCompositor.squirclePoints(size = 100f, exponent = 0.0, samples = 8)
    }

    // ── foregroundBounds ─────────────────────────────────────────────────

    @Test
    fun `foregroundBounds scales and centers using the default 0_72 scale`() {
        val bounds = AdaptiveIconCompositor.foregroundBounds(size = 100)
        assertEquals(72, bounds.scaledSize)
        assertEquals(14, bounds.offset)
        // Centered: offset on both sides plus the scaled content covers the canvas
        // within a 1px rounding tolerance.
        assertTrue(abs((bounds.offset * 2 + bounds.scaledSize) - 100) <= 1)
    }

    @Test
    fun `foregroundBounds honors an explicit scale`() {
        val bounds = AdaptiveIconCompositor.foregroundBounds(size = 200, scale = 0.5f)
        assertEquals(100, bounds.scaledSize)
        assertEquals(50, bounds.offset)
    }

    @Test
    fun `foregroundBounds at scale 1 has no offset`() {
        val bounds = AdaptiveIconCompositor.foregroundBounds(size = 108, scale = 1f)
        assertEquals(108, bounds.scaledSize)
        assertEquals(0, bounds.offset)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `foregroundBounds rejects non-positive size`() {
        AdaptiveIconCompositor.foregroundBounds(size = 0)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `foregroundBounds rejects scale above 1`() {
        AdaptiveIconCompositor.foregroundBounds(size = 100, scale = 1.5f)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `foregroundBounds rejects zero scale`() {
        AdaptiveIconCompositor.foregroundBounds(size = 100, scale = 0f)
    }
}
