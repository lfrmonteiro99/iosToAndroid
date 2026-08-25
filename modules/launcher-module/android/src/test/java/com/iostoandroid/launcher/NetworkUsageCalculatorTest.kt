package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pure-JVM unit tests for [NetworkUsageCalculator] — the delta calculation
 * between two cumulative TrafficStats samples (#624-S4).
 */
class NetworkUsageCalculatorTest {

    @Test
    fun `computes the delta between two cumulative samples`() {
        // Issue's own worked example: A=100, B=350 -> delta 250.
        assertEquals(250L, NetworkUsageCalculator.computeDelta(100L, 350L))
    }

    @Test
    fun `zero delta when the counter has not moved`() {
        assertEquals(0L, NetworkUsageCalculator.computeDelta(500L, 500L))
    }

    @Test
    fun `counter reset (reboot) returns the whole current value, not a negative delta`() {
        // TrafficStats resets to 0 on boot; a smaller current sample than the
        // stored previous one means the previous baseline is stale.
        assertEquals(120L, NetworkUsageCalculator.computeDelta(900L, 120L))
    }

    @Test
    fun `first sample ever (previous less than zero, meaning unset) counts fully as delta`() {
        assertEquals(300L, NetworkUsageCalculator.computeDelta(-1L, 300L))
    }

    @Test
    fun `unsupported current sample (TrafficStats UNSUPPORTED, minus one) yields zero delta`() {
        assertEquals(0L, NetworkUsageCalculator.computeDelta(100L, -1L))
    }

    @Test
    fun `both samples zero yields zero delta`() {
        assertEquals(0L, NetworkUsageCalculator.computeDelta(0L, 0L))
    }
}
