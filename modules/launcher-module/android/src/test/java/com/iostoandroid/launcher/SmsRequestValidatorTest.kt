package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pure-JVM unit tests for [SmsRequestValidator] — no android.* imports,
 * runs without a device or the Android SDK.
 */
class SmsRequestValidatorTest {

    @Test
    fun `accepts non-blank address and non-empty body`() {
        assertNull(SmsRequestValidator.validate("912345678", "Olá, como estás?"))
        assertNull(SmsRequestValidator.validate("+351912345678", "a"))
    }

    @Test
    fun `rejects blank address`() {
        assertEquals("SMS não enviado: destinatário vazio", SmsRequestValidator.validate("", "corpo"))
        assertEquals("SMS não enviado: destinatário vazio", SmsRequestValidator.validate("   ", "corpo"))
    }

    @Test
    fun `rejects empty body`() {
        assertEquals("SMS não enviado: mensagem vazia", SmsRequestValidator.validate("912345678", ""))
    }

    @Test
    fun `reports address reason first when both are invalid`() {
        assertEquals("SMS não enviado: destinatário vazio", SmsRequestValidator.validate("", ""))
    }
}
