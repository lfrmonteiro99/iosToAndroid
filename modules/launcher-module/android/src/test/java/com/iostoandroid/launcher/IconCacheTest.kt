package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM unit tests for [IconCache] — the on-disk icon filename key and the
 * orphan-detection logic used by LauncherModule.getInstalledApps. No android.*
 * imports, so these run without a device or the Android SDK.
 */
class IconCacheTest {

    @Test
    fun `fileName encodes packageName and versionCode so an app update gets a new key`() {
        // #482/#486 fold shape key and icon treatment into the key; the no-arg
        // call uses both defaults.
        assertEquals(
            "com.android.settings_1_${IconCache.DEFAULT_SHAPE_KEY}_${IconTreatment.DEFAULT}.png",
            IconCache.fileName("com.android.settings", 1L)
        )
        // Same package, new versionCode after an update — different key entirely,
        // so the stale PNG is never mistaken for the new one.
        assertEquals(
            "com.android.settings_2_${IconCache.DEFAULT_SHAPE_KEY}_${IconTreatment.DEFAULT}.png",
            IconCache.fileName("com.android.settings", 2L)
        )
    }

    @Test
    fun `fileName is stable for the same package, versionCode and treatment`() {
        val first = IconCache.fileName("com.example.app", 42L)
        val second = IconCache.fileName("com.example.app", 42L)
        assertTrue(first == second)
    }

    @Test
    fun `fileName encodes the icon treatment, so changing it in Settings orphans the old key`() {
        val maskAll = IconCache.fileName("com.example.app", 1L, treatment = IconTreatment.MASK_ALL)
        val adaptiveOnly = IconCache.fileName("com.example.app", 1L, treatment = IconTreatment.MASK_ADAPTIVE_ONLY)
        val none = IconCache.fileName("com.example.app", 1L, treatment = IconTreatment.NONE)

        assertTrue(maskAll != adaptiveOnly)
        assertTrue(adaptiveOnly != none)
        assertTrue(maskAll != none)

        // Simulate: cache was built under 'mask-all', user switches to 'none' — the
        // old file no longer matches the single valid key for the new treatment.
        val existing = listOf(maskAll)
        val validUnderNewTreatment = setOf(none)
        assertEquals(listOf(maskAll), IconCache.orphanedFiles(existing, validUnderNewTreatment))
    }

    @Test
    fun `fileName sanitizes a malformed treatment so JS cannot escape the icons directory`() {
        // Mesmo guard do shapeKey: um tratamento que não seja um dos três válidos
        // não pode introduzir separadores de caminho no nome do ficheiro.
        val escaped = IconCache.fileName("com.example.app", 1L, treatment = "../../evil")
        assertFalse(escaped.contains('/'))
        assertFalse(escaped.contains(".."))
    }

    @Test
    fun `totalSizeBytes sums file sizes, and is zero for an empty cache`() {
        assertEquals(0L, IconCache.totalSizeBytes(emptyList()))
        assertEquals(150L, IconCache.totalSizeBytes(listOf(100L, 50L)))
    }

    @Test
    fun `orphanedFiles is empty when every cached file matches a currently valid key`() {
        val existing = listOf("com.a_1.png", "com.b_3.png")
        val valid = setOf("com.a_1.png", "com.b_3.png")
        assertTrue(IconCache.orphanedFiles(existing, valid).isEmpty())
    }

    @Test
    fun `orphanedFiles flags an uninstalled app's icon for removal`() {
        val existing = listOf("com.a_1.png", "com.uninstalled_5.png")
        val valid = setOf("com.a_1.png") // com.uninstalled is no longer among installed apps
        assertEquals(listOf("com.uninstalled_5.png"), IconCache.orphanedFiles(existing, valid))
    }

    @Test
    fun `orphanedFiles flags the previous versionCode's icon after an app update`() {
        // com.a updated from versionCode 1 to 2 — only the new key is valid now,
        // the old file must not linger on disk forever.
        val existing = listOf("com.a_1.png", "com.a_2.png")
        val valid = setOf("com.a_2.png")
        assertEquals(listOf("com.a_1.png"), IconCache.orphanedFiles(existing, valid))
    }

    @Test
    fun `orphanedFiles never flags a file whose exact name is still valid`() {
        val existing = listOf("com.a_1.png")
        val valid = setOf("com.a_1.png")
        assertTrue(IconCache.orphanedFiles(existing, valid).isEmpty())
    }
}
