package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SmsResultMapperTest {

    @Test
    fun `RESULT_OK maps to success with no reason`() {
        val outcome = SmsResultMapper.map(SmsResultMapper.RESULT_OK)
        assertTrue(outcome.success)
        assertNull(outcome.reason)
    }

    @Test
    fun `RESULT_ERROR_NO_SERVICE maps to a distinguishable failure`() {
        val outcome = SmsResultMapper.map(SmsResultMapper.RESULT_ERROR_NO_SERVICE)
        assertFalse(outcome.success)
        assertEquals("no_service", outcome.reason)
    }

    @Test
    fun `RESULT_ERROR_RADIO_OFF maps to a distinguishable failure`() {
        val outcome = SmsResultMapper.map(SmsResultMapper.RESULT_ERROR_RADIO_OFF)
        assertFalse(outcome.success)
        assertEquals("radio_off", outcome.reason)
    }

    @Test
    fun `RESULT_ERROR_NULL_PDU maps to a distinguishable failure`() {
        val outcome = SmsResultMapper.map(SmsResultMapper.RESULT_ERROR_NULL_PDU)
        assertFalse(outcome.success)
        assertEquals("pdu_error", outcome.reason)
    }

    @Test
    fun `RESULT_ERROR_GENERIC_FAILURE maps to a distinguishable failure`() {
        val outcome = SmsResultMapper.map(SmsResultMapper.RESULT_ERROR_GENERIC_FAILURE)
        assertFalse(outcome.success)
        assertEquals("generic_failure", outcome.reason)
    }

    @Test
    fun `an unrecognised resultCode still fails, never silently succeeds`() {
        val outcome = SmsResultMapper.map(999)
        assertFalse(outcome.success)
        assertEquals("unknown_error", outcome.reason)
    }

    @Test
    fun `aggregate succeeds only when every part reports RESULT_OK`() {
        val outcome = SmsResultMapper.aggregate(
            listOf(SmsResultMapper.RESULT_OK, SmsResultMapper.RESULT_OK, SmsResultMapper.RESULT_OK)
        )
        assertTrue(outcome.success)
        assertNull(outcome.reason)
    }

    @Test
    fun `aggregate fails the whole send when exactly one part fails`() {
        val outcome = SmsResultMapper.aggregate(
            listOf(SmsResultMapper.RESULT_OK, SmsResultMapper.RESULT_ERROR_NO_SERVICE, SmsResultMapper.RESULT_OK)
        )
        assertFalse(outcome.success)
        assertEquals("no_service", outcome.reason)
    }

    @Test
    fun `aggregate on a single-part send behaves like map`() {
        val outcome = SmsResultMapper.aggregate(listOf(SmsResultMapper.RESULT_ERROR_RADIO_OFF))
        assertFalse(outcome.success)
        assertEquals("radio_off", outcome.reason)
    }

    @Test
    fun `aggregate on an empty result list is a failure, not a vacuous success`() {
        val outcome = SmsResultMapper.aggregate(emptyList())
        assertFalse(outcome.success)
        assertEquals("no_parts", outcome.reason)
    }
}
