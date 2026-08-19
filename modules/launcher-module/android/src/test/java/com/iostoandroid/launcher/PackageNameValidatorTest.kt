package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM unit tests for [PackageNameValidator] — the shape regex and the
 * whitelist resolution used by LauncherModule.launchApp. No android.* imports,
 * so these run without a device or the Android SDK.
 */
class PackageNameValidatorTest {

    @Test
    fun `accepts well-formed package names`() {
        assertTrue(PackageNameValidator.isValidShape("com.android.settings"))
        assertTrue(PackageNameValidator.isValidShape("com.nonexistent.app"))
        assertTrue(PackageNameValidator.isValidShape("not.a.package"))
        assertTrue(PackageNameValidator.isValidShape("a.b"))
        assertTrue(PackageNameValidator.isValidShape("com.example.my_app"))
        assertTrue(PackageNameValidator.isValidShape("com.example.app2"))
    }

    @Test
    fun `rejects empty and malformed package names`() {
        assertFalse(PackageNameValidator.isValidShape(""))
        assertFalse(PackageNameValidator.isValidShape("no_dot"))
        assertFalse(PackageNameValidator.isValidShape(".leading"))
        assertFalse(PackageNameValidator.isValidShape("com..double"))
        assertFalse(PackageNameValidator.isValidShape("com.trailing."))
        assertFalse(PackageNameValidator.isValidShape("1com.example"))
        assertFalse(PackageNameValidator.isValidShape("com.example.app-"))
        assertFalse(PackageNameValidator.isValidShape("com.example.app "))
        assertFalse(PackageNameValidator.isValidShape("com.example.app\n"))
        assertFalse(PackageNameValidator.isValidShape("com.example.app/extra"))
        assertFalse(PackageNameValidator.isValidShape("com.example.app?x=1"))
        assertFalse(PackageNameValidator.isValidShape("com.example.app#frag"))
        assertFalse(PackageNameValidator.isValidShape("com.example.app:port"))
        assertFalse(PackageNameValidator.isValidShape("com.example.app;param"))
        assertFalse(PackageNameValidator.isValidShape("com.example.app,com.other"))
        assertFalse(PackageNameValidator.isValidShape("com.example.app.1"))
        assertFalse(PackageNameValidator.isValidShape("a"))
    }

    @Test
    fun `resolves launch intent only for valid shape`() {
        var resolverCalls = 0
        val resolver: (String) -> String? = { pkg ->
            resolverCalls++
            if (pkg == "com.android.settings") "launch-intent" else null
        }

        assertEquals(
            "launch-intent",
            PackageNameValidator.resolveIfValidShape("com.android.settings", resolver)
        )
        assertEquals(1, resolverCalls)

        assertNull(PackageNameValidator.resolveIfValidShape("com.nonexistent.app", resolver))
        assertEquals(2, resolverCalls)
    }

    @Test
    fun `does not call resolver for malformed names`() {
        var resolverCalls = 0
        val resolver: (String) -> String? = { pkg ->
            resolverCalls++
            "launch-intent"
        }

        assertNull(PackageNameValidator.resolveIfValidShape("", resolver))
        assertNull(PackageNameValidator.resolveIfValidShape("not a package", resolver))
        assertNull(PackageNameValidator.resolveIfValidShape("com.example.app/extra", resolver))
        assertEquals(0, resolverCalls)
    }
}
