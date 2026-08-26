package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM unit tests for [KMeansColorPicker] — the k=3 dominant-colour
 * picker LauncherModule.backfillTransparentCorners uses for the squircle
 * corner backfill (§4.1.3 of epic #466). No android.* imports, so these run
 * without a device or the Android SDK. Pixels are packed ARGB ints, built by
 * hand the same way android.graphics.Bitmap.getPixels() would return them.
 */
class KMeansColorPickerTest {

    private fun argb(a: Int, r: Int, g: Int, b: Int): Int =
        (a shl 24) or (r shl 16) or (g shl 8) or b

    private fun red(c: Int) = (c ushr 16) and 0xFF
    private fun green(c: Int) = (c ushr 8) and 0xFF
    private fun blue(c: Int) = c and 0xFF

    @Test
    fun `a uniformly-coloured saturated icon returns its own colour`() {
        // Circular icon on a saturated background: every opaque pixel is the
        // same blue, the rest of the square canvas is transparent.
        val blue = argb(255, 30, 80, 200)
        val pixels = IntArray(40) { i -> if (i < 30) blue else argb(0, 0, 0, 0) }

        val result = KMeansColorPicker.dominantColor(pixels)

        assertEquals(blue, result)
    }

    @Test
    fun `a white-majority icon with a saturated logo returns the logo colour, not white`() {
        // Circular icon on a white fill (majority pixels) with a red logo
        // (minority pixels) — the naive edge-average would return white here,
        // since white dominates the pixel count and the icon's own border.
        val white = argb(255, 255, 255, 255)
        val red = argb(255, 220, 40, 40)
        val pixels = IntArray(100) { i -> if (i < 70) white else red }

        val result = KMeansColorPicker.dominantColor(pixels)

        assertEquals(red, result)
    }

    @Test
    fun `an icon that is almost entirely white falls back instead of returning white`() {
        // All clusters land in near-white territory — must signal "no
        // dominant colour" (null) rather than hand back white as if it were
        // a legitimate answer.
        val white = argb(255, 255, 255, 255)
        val offWhite = argb(255, 250, 248, 252)
        val pixels = IntArray(20) { i -> if (i % 2 == 0) white else offWhite }

        assertNull(KMeansColorPicker.dominantColor(pixels))
    }

    @Test
    fun `an icon that is almost entirely black also falls back`() {
        // Symmetric case to the near-white one: a near-black-only icon must
        // not be reported as its own "dominant colour" either.
        val black = argb(255, 5, 5, 5)
        val nearBlack = argb(255, 12, 10, 8)
        val pixels = IntArray(20) { i -> if (i % 2 == 0) black else nearBlack }

        assertNull(KMeansColorPicker.dominantColor(pixels))
    }

    @Test
    fun `a fully transparent bitmap has no dominant colour`() {
        val pixels = IntArray(16) { argb(0, 0, 0, 0) }

        assertNull(KMeansColorPicker.dominantColor(pixels))
    }

    @Test
    fun `a colour just under the white threshold is not discarded`() {
        val almostWhite = argb(255, 234, 234, 234)
        val pixels = IntArray(9) { almostWhite }

        assertEquals(almostWhite, KMeansColorPicker.dominantColor(pixels))
    }

    @Test
    fun `a colour at the white threshold is discarded`() {
        val white = argb(255, 235, 235, 235)
        val pixels = IntArray(9) { white }

        assertNull(KMeansColorPicker.dominantColor(pixels))
    }

    @Test
    fun `a dark but saturated colour is not mistaken for near-black`() {
        // Navy: green and blue are low but red is well above the near-black
        // channel threshold, so this must survive as the dominant colour.
        val navy = argb(255, 0, 0, 90)
        val pixels = IntArray(12) { navy }

        assertEquals(navy, KMeansColorPicker.dominantColor(pixels))
    }

    @Test
    fun `result colour components are always in range regardless of input order`() {
        val a = argb(255, 10, 200, 60)
        val b = argb(255, 90, 30, 240)
        val pixels = intArrayOf(a, b, a, b, a, b, a, b)

        val result = KMeansColorPicker.dominantColor(pixels)

        assertTrue(result != null)
        val r = red(result!!)
        val g = green(result)
        val bl = blue(result)
        assertTrue(r in 0..255 && g in 0..255 && bl in 0..255)
    }
}
