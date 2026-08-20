package com.iostoandroid.launcher

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM unit tests for [PhoneNumberValidator] — no android.* imports,
 * runs without a device or the Android SDK.
 */
class PhoneNumberValidatorTest {

    @Test
    fun `accepts valid dial strings`() {
        assertTrue(PhoneNumberValidator.isValidShape("(555) 123-4567"))
        assertTrue(PhoneNumberValidator.isValidShape("*#06#"))
        assertTrue(PhoneNumberValidator.isValidShape("+351 912 345 678"))
        assertTrue(PhoneNumberValidator.isValidShape("123"))
        assertTrue(PhoneNumberValidator.isValidShape("+1234567890123456789")) // 20 chars — max
        assertTrue(PhoneNumberValidator.isValidShape("+1-800-555.1234"))
        assertTrue(PhoneNumberValidator.isValidShape("*31#"))
    }

    @Test
    fun `rejects injection and illegal characters`() {
        assertFalse(PhoneNumberValidator.isValidShape("+1555\n;attack"))
        assertFalse(PhoneNumberValidator.isValidShape("+1555%0A;evil"))
        assertFalse(PhoneNumberValidator.isValidShape("tel:+15551234"))   // colon not in class
        assertFalse(PhoneNumberValidator.isValidShape("&"))
        assertFalse(PhoneNumberValidator.isValidShape("?"))
        assertFalse(PhoneNumberValidator.isValidShape("@"))
        assertFalse(PhoneNumberValidator.isValidShape(","))
        assertFalse(PhoneNumberValidator.isValidShape(";"))
        assertFalse(PhoneNumberValidator.isValidShape("//"))
    }

    @Test
    fun `rejects empty and overlong strings`() {
        assertFalse(PhoneNumberValidator.isValidShape(""))
        assertFalse(PhoneNumberValidator.isValidShape("+12345678901234567890")) // 21 chars — over max
    }
}
