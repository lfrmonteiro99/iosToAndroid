package com.iostoandroid.launcher

/**
 * Pure delta calculation for the network-usage monitor (#624-S4).
 *
 * `TrafficStats.getUidTxBytes(uid)` / `getUidRxBytes(uid)` are CUMULATIVE
 * counters since the last device boot, not a per-window measurement — the same
 * contract problem documented for the pedometer sensor
 * (see health-epic-sensor-contract-cumulative in the team's notes). To turn two
 * cumulative samples into "bytes used since the last sample" a delta has to be
 * computed explicitly; this object is the ONLY place that does it, kept
 * framework-free so it is unit-testable on a pure JVM without an Android
 * runtime (mirrors CategoryMapper / PhoneNumberValidator in this package).
 */
object NetworkUsageCalculator {

    /**
     * Bytes transferred between two cumulative samples of the same counter.
     *
     * The normal case is `current >= previous`: the delta is the difference.
     * `current < previous` means the underlying counter went backwards — the
     * only way that happens is the device rebooted (TrafficStats resets to 0 on
     * boot) or the app's UID was reassigned. In that case the previous sample is
     * stale and cannot be subtracted from meaningfully, so the whole current
     * value is the delta: every byte counted since boot is new relative to the
     * (now invalid) previous baseline.
     *
     * A negative or non-finite sample is invalid input (TrafficStats' documented
     * failure value is -1 for "unsupported") — never a valid delta, so it
     * collapses to zero rather than a negative charge to the app's usage.
     */
    fun computeDelta(previousCumulative: Long, currentCumulative: Long): Long {
        if (currentCumulative < 0) return 0L
        val previous = if (previousCumulative < 0) 0L else previousCumulative
        return if (currentCumulative >= previous) {
            currentCumulative - previous
        } else {
            // Counter reset (reboot): the entire current value is new usage.
            currentCumulative
        }
    }
}
