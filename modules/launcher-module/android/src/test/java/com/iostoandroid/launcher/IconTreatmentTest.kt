package com.iostoandroid.launcher

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM unit tests for [IconTreatment] — the mask-all/mask-adaptive-only/none
 * policy #486 exposes in Settings. No android.* imports, so these run without
 * a device or the Android SDK.
 */
class IconTreatmentTest {

    @Test
    fun `mask-all masks every icon, adaptive or not`() {
        assertTrue(IconTreatment.shouldMask(isAdaptive = true, treatment = IconTreatment.MASK_ALL))
        assertTrue(IconTreatment.shouldMask(isAdaptive = false, treatment = IconTreatment.MASK_ALL))
    }

    @Test
    fun `none masks nothing, adaptive or not`() {
        assertFalse(IconTreatment.shouldMask(isAdaptive = true, treatment = IconTreatment.NONE))
        assertFalse(IconTreatment.shouldMask(isAdaptive = false, treatment = IconTreatment.NONE))
    }

    @Test
    fun `mask-adaptive-only masks adaptive icons and leaves non-adaptive icons alone`() {
        assertTrue(IconTreatment.shouldMask(isAdaptive = true, treatment = IconTreatment.MASK_ADAPTIVE_ONLY))
        assertFalse(IconTreatment.shouldMask(isAdaptive = false, treatment = IconTreatment.MASK_ADAPTIVE_ONLY))
    }

    @Test
    fun `DEFAULT constant is mask-adaptive-only, matching SettingsStore's default`() {
        assertTrue(IconTreatment.DEFAULT == IconTreatment.MASK_ADAPTIVE_ONLY)
    }

    @Test
    fun `an unrecognized treatment string falls back to DEFAULT's behaviour instead of masking everything or nothing`() {
        assertTrue(IconTreatment.shouldMask(isAdaptive = true, treatment = "unknown"))
        assertFalse(IconTreatment.shouldMask(isAdaptive = false, treatment = "unknown"))
    }
}
