package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * Pure-JVM tests for the icon-shape mask spec (#482): what JS sends, what the
 * native side does with it, and the cache-key invalidation that makes a shape
 * change visible instead of serving the previously-masked PNG.
 */
class IconMaskSpecTest {

    @Test
    fun `a null mask falls back to the default squircle instead of disabling masking`() {
        val spec = IconMaskSpec.from(null)
        assertEquals(AdaptiveIconCompositor.DEFAULT_SQUIRCLE_EXPONENT, spec.exponent)
        assertEquals(IconCache.DEFAULT_SHAPE_KEY, spec.cacheKey)
        assertTrue(spec.hasMask)
    }

    @Test
    fun `original means no mask at all`() {
        val spec = IconMaskSpec.from(mapOf("shape" to "original", "exponent" to null, "cacheKey" to "original"))
        assertNull(spec.exponent)
        assertFalse(spec.hasMask)
    }

    @Test
    fun `the exponent is clamped to the useful range, not rejected`() {
        assertEquals(
            IconMaskSpec.MAX_EXPONENT,
            IconMaskSpec.from(mapOf("shape" to "squircle", "exponent" to 999.0, "cacheKey" to "k")).exponent
        )
        assertEquals(
            IconMaskSpec.MIN_EXPONENT,
            IconMaskSpec.from(mapOf("shape" to "squircle", "exponent" to -5.0, "cacheKey" to "k")).exponent
        )
    }

    @Test
    fun `NaN and infinity fall back to the default, never to zero`() {
        for (bad in listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY)) {
            val spec = IconMaskSpec.from(mapOf("shape" to "squircle", "exponent" to bad, "cacheKey" to "k"))
            assertEquals(AdaptiveIconCompositor.DEFAULT_SQUIRCLE_EXPONENT, spec.exponent)
        }
    }

    @Test
    fun `a missing exponent on a masked shape is the default, not null`() {
        val spec = IconMaskSpec.from(mapOf("shape" to "squircle", "cacheKey" to "k"))
        assertEquals(AdaptiveIconCompositor.DEFAULT_SQUIRCLE_EXPONENT, spec.exponent)
        assertTrue(spec.hasMask)
    }

    @Test
    fun `an integer exponent from the bridge is accepted, not dropped`() {
        val spec = IconMaskSpec.from(mapOf("shape" to "squircle", "exponent" to 3, "cacheKey" to "k"))
        assertEquals(3.0, spec.exponent)
    }

    @Test
    fun `a blank cacheKey falls back rather than producing a nameless file`() {
        assertEquals(
            IconCache.DEFAULT_SHAPE_KEY,
            IconMaskSpec.from(mapOf("shape" to "", "cacheKey" to "  ")).cacheKey
        )
    }

    // ── cache invalidation ──────────────────────────────────────────────

    @Test
    fun `changing the shape changes the cache filename, so the old PNG is orphaned`() {
        val squircle = IconCache.fileName("com.a", 1L, "squircle4.7")
        val circle = IconCache.fileName("com.a", 1L, "circle2.0")
        assertNotEquals(squircle, circle)
        // Antes: só o nome do pacote e a versão. A forma nova reutilizava o PNG
        // antigo e a definição parecia não fazer nada.
        assertEquals(listOf(squircle), IconCache.orphanedFiles(listOf(squircle, circle), setOf(circle)))
    }

    @Test
    fun `changing only the exponent changes the cache filename too`() {
        assertNotEquals(
            IconCache.fileName("com.a", 1L, "squircle4.7"),
            IconCache.fileName("com.a", 1L, "squircle3.0")
        )
    }

    @Test
    fun `the same shape and version yields the same filename, otherwise nothing would ever hit`() {
        assertEquals(
            IconCache.fileName("com.a", 1L, "squircle4.7"),
            IconCache.fileName("com.a", 1L, "squircle4.7")
        )
    }

    @Test
    fun `a shape key with path separators cannot escape the icons directory`() {
        val name = IconCache.fileName("com.a", 1L, "../../etc/passwd")
        assertFalse(name.contains("/"))
        // O treatment default entra na chave desde o #486, tal como a shape.
        assertEquals("com.a_1_..-..-etc-passwd_${IconTreatment.DEFAULT}.png", name)
    }

    @Test
    fun `an empty shape key falls back to the default key`() {
        assertEquals(
            "com.a_1_${IconCache.DEFAULT_SHAPE_KEY}_${IconTreatment.DEFAULT}.png",
            IconCache.fileName("com.a", 1L, "")
        )
    }

    @Test
    fun `the versionCode key still invalidates on app update with the shape folded in`() {
        val old = IconCache.fileName("com.a", 1L, "squircle4.7")
        val new = IconCache.fileName("com.a", 2L, "squircle4.7")
        assertEquals(listOf(old), IconCache.orphanedFiles(listOf(old, new), setOf(new)))
    }
}
