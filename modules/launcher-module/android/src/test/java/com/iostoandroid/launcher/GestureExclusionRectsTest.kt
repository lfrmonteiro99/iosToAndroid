package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pure-JVM unit tests for [GestureExclusionRects] — no android.* imports, runs
 * without a device or the Android SDK (same pattern as [PhoneNumberValidatorTest]).
 */
class GestureExclusionRectsTest {

    @Test
    fun `covers the whole view when shorter than the android limit`() {
        val rect = GestureExclusionRects.forView(width = 40, height = 300, density = 2f)!!
        assertEquals(0, rect.left)
        assertEquals(0, rect.top)
        assertEquals(40, rect.right)
        assertEquals(300, rect.bottom)
    }

    @Test
    fun `clamps to ~200dp of height because android ignores the excess`() {
        // density 2 → 200dp == 400px; a 2000px tall strip must not ask for more.
        val rect = GestureExclusionRects.forView(width = 40, height = 2000, density = 2f)!!
        assertEquals(400, rect.bottom)
        assertEquals(0, rect.top)
    }

    @Test
    fun `limit is exactly the boundary, and boundary plus one clamps`() {
        assertEquals(400, GestureExclusionRects.forView(40, 400, 2f)!!.bottom)
        assertEquals(400, GestureExclusionRects.forView(40, 401, 2f)!!.bottom)
        assertEquals(399, GestureExclusionRects.forView(40, 399, 2f)!!.bottom)
    }

    @Test
    fun `no rect for a view that has not been laid out yet`() {
        assertNull(GestureExclusionRects.forView(0, 0, 2f))
        assertNull(GestureExclusionRects.forView(40, 0, 2f))
        assertNull(GestureExclusionRects.forView(0, 300, 2f))
        assertNull(GestureExclusionRects.forView(-40, -300, 2f))
    }

    @Test
    fun `absurd density values do not produce an empty or negative rect`() {
        // density 0 is nonsense → treated as 1, i.e. 200dp == 200px.
        assertEquals(200, GestureExclusionRects.forView(40, 900, 0f)!!.bottom)
        assertEquals(200, GestureExclusionRects.forView(40, 900, -3f)!!.bottom)
        // density 100 → limit far beyond the view, so the whole view is used.
        assertEquals(900, GestureExclusionRects.forView(40, 900, 100f)!!.bottom)
    }
}
