package com.iostoandroid.launcher

/**
 * Pure Kotlin twin of src/utils/backTapClassifier.ts. Runs on the sensor
 * thread inside [TapSensorService] so the back-tap math is identical to the
 * JS edition that jest covers — the two must stay in sync.
 *
 * A "back tap" is two or three sharp accelerometric impulses in quick
 * succession (iOS 14+ Back Tap). Manufacturers differ in sensor sensitivity
 * and in how the fused accelerometer/gyroscope reports the impulse, so the
 * windows are configurable: [doubleWindowMs] is the gap allowed for a DOUBLE,
 * [tripleWindowMs] is the span allowed across three taps for a TRIPLE.
 *
 * The window an impulse must fall inside is measured against the LATEST tap,
 * not the first — a long pause followed by a quick burst still counts, and a
 * stale leading tap is pruned instead of poisoning the judgment.
 */
class TapClassifier(
    private val doubleWindowMs: Long = DEFAULT_DOUBLE_WINDOW_MS,
    private val tripleWindowMs: Long = DEFAULT_TRIPLE_WINDOW_MS,
) {
    private val taps = mutableListOf<Long>()

    fun push(timestampMs: Long): BackTap? {
        if (!timestampMs.isFinite()) return null
        // Ignore non-increasing timestamps: a stuck sensor repeating a value or
        // frames arriving out of order across the bridge are never a real extra
        // tap, and feeding them through would manufacture false doubles.
        if (taps.isNotEmpty() && timestampMs <= taps.last()) return null

        taps.add(timestampMs)
        val latest = timestampMs
        // Keep only taps within the (wider) triple window of the latest.
        taps.removeAll { latest - it > tripleWindowMs }

        if (taps.size >= 3) {
            val last3 = taps.takeLast(3)
            return BackTap(BackTapType.TRIPLE, last3.size, last3.toList())
        }
        if (taps.size >= 2) {
            val last2 = taps.takeLast(2)
            if (last2[1] - last2[0] <= doubleWindowMs) {
                return BackTap(BackTapType.DOUBLE, last2.size, last2.toList())
            }
        }
        return null
    }

    fun reset() {
        taps.clear()
    }

    private fun Long.isFinite(): Boolean = this != Long.MIN_VALUE && this != Long.MAX_VALUE

    companion object {
        const val DEFAULT_DOUBLE_WINDOW_MS = 300L
        const val DEFAULT_TRIPLE_WINDOW_MS = 600L
    }
}

enum class BackTapType { DOUBLE, TRIPLE }

data class BackTap(
    val type: BackTapType,
    val count: Int,
    val taps: List<Long>,
)
