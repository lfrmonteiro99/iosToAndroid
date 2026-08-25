package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pure-JVM unit tests for [BackTapDetector] — the acceleration-signal twin of
 * TapClassifier that runs without a device, SensorManager, or the Android SDK.
 * These mirror the PackageNameValidatorTest.kt shape: JUnit 4 only, no android.*
 * imports, synthetic series that pin the required gesture matrix from #769.
 */
class BackTapDetectorTest {

    // GRAVITY is the resting magnitude of a fused Android accelerometer and is
    // kept out of baseline noise so the synthetic series below read naturally.
    private val GRAVITY = 9.81

    /** One sample at magnitude [mag] around [t] ms; axes are split to sum to mag². */
    private fun sample(t: Long, mag: Double): AccelSample {
        // Split the magnitude across x and z so √(x²+z²) == mag exactly.
        val per = mag / Math.sqrt(2.0)
        return AccelSample(t, per, 0.0, per)
    }

    /** A sharp tap: baseline -> spike -> baseline, centered on [centerMs]. */
    private fun tap(centerMs: Long): List<AccelSample> = listOf(
        sample(centerMs - 10, GRAVITY),
        sample(centerMs, GRAVITY + 12.0), // 21.81 >> threshold: clean impulse
        sample(centerMs + 10, GRAVITY),
    )

    @Test
    fun `silence returns 0`() {
        val series = listOf(
            sample(0, GRAVITY),
            sample(20, GRAVITY + 0.5),
            sample(40, GRAVITY - 0.3),
            sample(60, GRAVITY),
        )
        assertEquals(0, BackTapDetector().detect(series))
    }

    @Test
    fun `single tap returns 1`() {
        assertEquals(1, BackTapDetector().detect(tap(100)))
    }

    @Test
    fun `double tap within valid gap returns 2`() {
        assertEquals(2, BackTapDetector().detect(tap(100) + tap(250)))
    }

    @Test
    fun `double tap with too-long gap returns 1`() {
        // Gap of 1000ms >> doubleWindowMs (300): stale leading tap is dropped.
        assertEquals(1, BackTapDetector().detect(tap(100) + tap(1100)))
    }

    @Test
    fun `triple tap returns 3`() {
        assertEquals(3, BackTapDetector().detect(tap(100) + tap(220) + tap(340)))
    }

    @Test
    fun `sustained walking noise returns 0`() {
        // 4s of slowly oscillating (non-returning) acceleration well above the
        // floor. No clean spike->baseline impulse ever closes -> no false tap.
        val series = mutableListOf<AccelSample>()
        for (i in 0..40) {
            val t = i * 100L
            val mag = GRAVITY + 6.0 + 4.0 * Math.sin(i * 0.6) // ~18..20, sustains
            series.add(sample(t, mag))
        }
        assertEquals(0, BackTapDetector().detect(series))
    }

    @Test
    fun `corrupt sample returns null`() {
        assertNull(BackTapDetector().detect(listOf(sample(0, GRAVITY), AccelSample(10, Double.NaN, 0.0, 0.0))))
        assertNull(BackTapDetector().detect(listOf(sample(0, GRAVITY), AccelSample(10, Double.POSITIVE_INFINITY, 0.0, 0.0))))
    }

    @Test
    fun `non-increasing timestamp returns null`() {
        // A stuck sensor repeating a value is never a real extra tap.
        assertNull(BackTapDetector().detect(listOf(sample(100, GRAVITY + 12.0), sample(100, GRAVITY + 12.0))))
    }

    @Test
    fun `incremental push matches detect on a double`() {
        val detector = BackTapDetector()
        var last = 0
        for (s in tap(100) + tap(250)) last = detector.push(s) ?: -1
        assertEquals(2, last)
    }

    @Test
    fun `short gap below minimum does not over-count`() {
        // Two spikes 40ms apart are too tight to be distinct taps (below the
        // double minimum gap of 100ms); the windowing collapses them to a
        // single counted impulse -> 1, not 2. Series are kept non-overlapping
        // so the timestamps stay strictly increasing.
        assertEquals(1, BackTapDetector().detect(tap(100) + tap(140)))
    }

    @Test
    fun `four taps collapse to triple (3)`() {
        // "Quadruple back tap" is not a thing iOS exposes; cap at 3.
        assertEquals(3, BackTapDetector().detect(tap(100) + tap(200) + tap(300) + tap(400)))
    }
}
