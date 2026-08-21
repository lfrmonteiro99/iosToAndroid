package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
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
        assertEquals(
            "com.android.settings_1.png",
            IconCache.fileName("com.android.settings", 1L)
        )
        // Same package, new versionCode after an update — different key entirely,
        // so the stale PNG is never mistaken for the new one.
        assertEquals(
            "com.android.settings_2.png",
            IconCache.fileName("com.android.settings", 2L)
        )
    }

    @Test
    fun `fileName is stable for the same package and versionCode`() {
        val first = IconCache.fileName("com.example.app", 42L)
        val second = IconCache.fileName("com.example.app", 42L)
        assertTrue(first == second)
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
