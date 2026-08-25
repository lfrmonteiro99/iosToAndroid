package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.hypot

/**
 * Pure-JVM unit tests for [SuperellipsePath] — the Kotlin geometry generator
 * that drives LauncherModule.applySquircleMask. Kept free of android.* imports
 * so it can be unit-tested without a device or the Android SDK.
 *
 * The reference values below were produced by src/theme/squircle.ts
 * (superellipsePath) at commit main 1.20.0 — the TS generator from #478 that
 * this Kotlin code must match. Each expected coordinate is the literal output
 * of `superellipsePath(size, n, segments)` for the same parameters, so this
 * test proves the native mask and the reference SVG share the same formula.
 */
class SuperellipsePathTest {

    @Test
    fun `returns exactly segments points`() {
        assertEquals(64, SuperellipsePath.points(200, 4.7, 64).size)
        assertEquals(8, SuperellipsePath.points(100, 4.7, 8).size)
        assertEquals(32, SuperellipsePath.points(50, 4.7, 32).size)
    }

    @Test
    fun `first point sits on the right middle for size 200 n 4 point 7`() {
        // squircle.ts superellipsePath(200, 4.7, 64) -> i=0 = (200, 100)
        val p = SuperellipsePath.points(200, 4.7, 64)[0]
        assertEquals(200.0, p.first, 1e-6)
        assertEquals(100.0, p.second, 1e-6)
    }

    @Test
    fun `key points match the TS squircle reference for size 200 n 4 point 7`() {
        // These are the literal outputs of superellipsePath(200, 4.7, 64):
        //   i=0  -> (200.0000, 100.0000)
        //   i=8  -> (186.2881, 186.2881)
        //   i=16 -> (100.0000, 200.0000)
        //   i=32 -> (  0.0000, 100.0000)
        //   i=48 -> (100.0000,   0.0000)
        //   i=63 -> (199.7948,  62.7808)
        val pts = SuperellipsePath.points(200, 4.7, 64)
        assertClose(pts[0], 200.0000, 100.0000)
        assertClose(pts[8], 186.2881, 186.2881)
        assertClose(pts[16], 100.0000, 200.0000)
        assertClose(pts[32], 0.0000, 100.0000)
        assertClose(pts[48], 100.0000, 0.0000)
        assertClose(pts[63], 199.7948, 62.7808)
    }

    @Test
    fun `scales linearly with size`() {
        // Halving the size must halve every coordinate (center and radius scale).
        val big = SuperellipsePath.points(200, 4.7, 64)
        val small = SuperellipsePath.points(100, 4.7, 64)
        for (i in big.indices) {
            assertEquals(big[i].first / 2.0, small[i].first, 1e-6)
            assertEquals(big[i].second / 2.0, small[i].second, 1e-6)
        }
    }

    @Test
    fun `is symmetric about the center`() {
        val size = 200
        val c = size / 2.0
        val segments = 64
        val pts = SuperellipsePath.points(size, 4.7, segments)
        // Parametric symmetry: point(i) and point(i + segments/2) are exact
        // opposites about the center, so their sum equals (2c, 2c). This is the
        // real 2-fold rotational symmetry of the superellipse, and it must hold
        // for every sample — not just the four cardinal points.
        for (i in pts.indices) {
            val j = (i + segments / 2) % segments
            // 1e-4 matches the 4-decimal precision of the squircle.ts reference
            // (the key-points test uses the same band); the only error source is
            // float drift at the cardinal endpoints (cos(PI) != exactly -1).
            assertEquals(2 * c, pts[i].first + pts[j].first, 1e-4)
            assertEquals(2 * c, pts[i].second + pts[j].second, 1e-4)
        }
    }

    @Test
    fun `n equals 2 approximates a circle with constant radius`() {
        val size = 200
        val c = size / 2.0
        val pts = SuperellipsePath.points(size, 2.0, 64)
        val r = size / 2.0
        for ((x, y) in pts) {
            val d = hypot(x - c, y - c)
            assertEquals(r, d, r * 0.1)
        }
    }

    @Test
    fun `more segments yields more sample points`() {
        val few = SuperellipsePath.points(100, 4.7, 8).size
        val many = SuperellipsePath.points(100, 4.7, 64).size
        assertTrue(many > few)
    }

    private fun assertClose(p: Pair<Double, Double>, ex: Double, ey: Double, tol: Double = 1e-4) {
        assertEquals("x", ex, p.first, tol)
        assertEquals("y", ey, p.second, tol)
    }
}
