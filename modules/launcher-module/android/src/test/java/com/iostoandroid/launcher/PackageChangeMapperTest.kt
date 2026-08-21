package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pure-JVM unit tests for [PackageChangeMapper] — the broadcast → JS payload
 * decision table used by [PackageChangeReceiver]. No android.* imports, so these
 * run without a device or the Android SDK.
 */
class PackageChangeMapperTest {

    private val own = "com.iostoandroid"

    @Test
    fun `a plain install maps to added`() {
        assertEquals(
            PackageChangeMapper.Change("added", "com.example.app"),
            PackageChangeMapper.map(PackageChangeMapper.ACTION_ADDED, "com.example.app", false, own)
        )
    }

    @Test
    fun `a plain uninstall maps to removed`() {
        assertEquals(
            PackageChangeMapper.Change("removed", "com.example.app"),
            PackageChangeMapper.map(PackageChangeMapper.ACTION_REMOVED, "com.example.app", false, own)
        )
    }

    @Test
    fun `PACKAGE_REPLACED maps to replaced, not added`() {
        assertEquals(
            PackageChangeMapper.Change("replaced", "com.example.app"),
            PackageChangeMapper.map(PackageChangeMapper.ACTION_REPLACED, "com.example.app", false, own)
        )
    }

    @Test
    fun `ADDED while replacing maps to replaced`() {
        assertEquals(
            PackageChangeMapper.Change("replaced", "com.example.app"),
            PackageChangeMapper.map(PackageChangeMapper.ACTION_ADDED, "com.example.app", true, own)
        )
    }

    @Test
    fun `REMOVED while replacing is dropped so an update does not blink the app out of the grid`() {
        assertNull(
            PackageChangeMapper.map(PackageChangeMapper.ACTION_REMOVED, "com.example.app", true, own)
        )
    }

    @Test
    fun `our own package is ignored on every action`() {
        assertNull(PackageChangeMapper.map(PackageChangeMapper.ACTION_REPLACED, own, true, own))
        assertNull(PackageChangeMapper.map(PackageChangeMapper.ACTION_ADDED, own, false, own))
        assertNull(PackageChangeMapper.map(PackageChangeMapper.ACTION_REMOVED, own, false, own))
    }

    @Test
    fun `null or blank package name is dropped`() {
        assertNull(PackageChangeMapper.map(PackageChangeMapper.ACTION_ADDED, null, false, own))
        assertNull(PackageChangeMapper.map(PackageChangeMapper.ACTION_ADDED, "", false, own))
        assertNull(PackageChangeMapper.map(PackageChangeMapper.ACTION_ADDED, "   ", false, own))
    }

    @Test
    fun `an unrelated action is dropped`() {
        assertNull(
            PackageChangeMapper.map("android.intent.action.BOOT_COMPLETED", "com.example.app", false, own)
        )
        assertNull(PackageChangeMapper.map(null, "com.example.app", false, own))
    }
}
