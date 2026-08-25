package com.iostoandroid.launcher

import kotlin.math.sqrt

/**
 * Pure JVM detector of back-tap gestures from a time series of acceleration
 * samples. It has NO `android.*` / `SensorManager` imports — it runs under
 * plain JUnit so the gesture math is covered without a device or the Android
 * SDK (issue #769, part of #625).
 *
 * The raw signal is a stream of [AccelSample]s: each carries a timestamp (ms)
 * and the three raw acceleration axes (x, y, z) in m/s². Android's
 * accelerometer reports gravity, so a handset at rest reads |a| ≈ 9.81; a real
 * back tap is a SHARP transient spike on top of that baseline.
 *
 * Detection model — a sliding window over the series:
 *   1. For every sample the total acceleration magnitude |a| = √(x²+y²+z²) is
 *      computed. An IMPULSE is one clean up-crossing of [accelThreshold]
 *      followed by a return below [accelFloor]. Sustained (non-returning)
 *      acceleration — walking, pocket jostle — never closes an impulse, so it
 *      produces no false tap.
 *   2. Each closed impulse records its peak timestamp. Impulse timestamps older
 *      than [tripleWindowMs] behind the latest are pruned (they cannot belong
 *      to the current gesture).
 *   3. The surviving impulse count is mapped to a [TapCount]:
 *        - 0 impulses              -> 0 (silence)
 *        - 1 impulse               -> 1
 *        - 2 impulses, gap within  [doubleMinGapMs]..[doubleWindowMs] -> 2 (double)
 *        - 3+ impulses within      [tripleWindowMs]                    -> 3 (triple)
 *      A 2nd impulse whose gap is outside the double window is treated as the
 *      start of a fresh gesture: the stale leading impulse is dropped and the
 *      count falls back to 1 (never silently upgrades to a double).
 *
 * [detect] is the pure entry point: it replays a whole series and returns the
 * final [TapCount] (0..3), or `null` when a sample is corrupt (non-finite
 * value) or timestamps are non-monotonic — i.e. the function cannot operate.
 * [push] exposes the same logic incrementally for a streaming sensor thread.
 */
typealias TapCount = Int

data class AccelSample(
    val timestampMs: Long,
    val x: Double,
    val y: Double,
    val z: Double,
)

class BackTapDetector(
    private val accelThreshold: Double = DEFAULT_ACCEL_THRESHOLD,
    private val accelFloor: Double = DEFAULT_ACCEL_FLOOR,
    private val doubleWindowMs: Long = DEFAULT_DOUBLE_WINDOW_MS,
    private val tripleWindowMs: Long = DEFAULT_TRIPLE_WINDOW_MS,
    private val doubleMinGapMs: Long = DEFAULT_DOUBLE_MIN_GAP_MS,
) {
    // Recent samples inside the (wider) triple window.
    private val window = mutableListOf<AccelSample>()

    // Timestamps of closed impulses, pruned to the triple window of the latest.
    private val tapTimestamps = mutableListOf<Long>()

    // Whether the magnitude is currently above threshold (an open impulse).
    private var inImpulse = false

    // Peak timestamp of the open impulse (valid while [inImpulse] is true).
    private var impulsePeakTime = 0L

    /** Pure: replay a whole series and return the final count (0..3) or null. */
    fun detect(samples: List<AccelSample>): TapCount? {
        reset()
        var last: TapCount? = null
        for (sample in samples) {
            last = push(sample) ?: return null
        }
        return last ?: 0
    }

    /** Incremental: feed one sample, get the live count (0..3) or null. */
    fun push(sample: AccelSample): TapCount? {
        // timestampMs is a Long (always finite); only the acceleration axes can
        // carry NaN/+Inf from a corrupt or hostile sensor frame.
        if (!sample.x.isFinite() ||
            !sample.y.isFinite() ||
            !sample.z.isFinite()
        ) {
            return null
        }
        // Non-increasing timestamps: a stuck sensor repeating a value or frames
        // arriving out of order across the bridge are never a real extra tap,
        // and feeding them through would manufacture false doubles.
        if (window.isNotEmpty() && sample.timestampMs <= window.last().timestampMs) {
            return null
        }

        window.add(sample)
        val latest = sample.timestampMs
        window.removeAll { latest - it.timestampMs > tripleWindowMs }

        val magnitude = sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z)
        when {
            magnitude >= accelThreshold -> {
                if (!inImpulse) {
                    inImpulse = true
                    impulsePeakTime = sample.timestampMs
                }
            }
            inImpulse && magnitude <= accelFloor -> {
                // Impulse closed: a sharp spike returned to baseline.
                inImpulse = false
                registerImpulse(impulsePeakTime)
            }
        }

        return evaluate()
    }

    private fun registerImpulse(peakTimeMs: Long) {
        tapTimestamps.add(peakTimeMs)
        // Keep only impulses within the (wider) triple window of the latest.
        tapTimestamps.removeAll { peakTimeMs - it > tripleWindowMs }
    }

    private fun evaluate(): TapCount {
        return when {
            tapTimestamps.size >= 3 -> 3
            tapTimestamps.size == 2 -> {
                val gap = tapTimestamps[1] - tapTimestamps[0]
                if (gap in doubleMinGapMs..doubleWindowMs) {
                    2
                } else {
                    // Gap outside the double window: the leading impulse is
                    // stale, drop it and keep only the most recent tap.
                    tapTimestamps.removeAt(0)
                    1
                }
            }
            tapTimestamps.size == 1 -> 1
            else -> 0
        }
    }

    fun reset() {
        window.clear()
        tapTimestamps.clear()
        inImpulse = false
        impulsePeakTime = 0L
    }

    companion object {
        /** Resting Android accelerometer reads |a| ≈ 9.81 (gravity). */
        const val DEFAULT_ACCEL_THRESHOLD = 14.0
        const val DEFAULT_ACCEL_FLOOR = 11.0
        const val DEFAULT_DOUBLE_WINDOW_MS = 300L
        const val DEFAULT_TRIPLE_WINDOW_MS = 600L
        const val DEFAULT_DOUBLE_MIN_GAP_MS = 100L
    }
}
