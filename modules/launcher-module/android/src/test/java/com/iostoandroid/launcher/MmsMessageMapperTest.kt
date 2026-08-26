package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM unit tests for [MmsMessageMapper] — no android.* imports, runs
 * without a device or the Android SDK.
 */
class MmsMessageMapperTest {

    private val inbox = 1 // Telephony.Mms.MESSAGE_BOX_INBOX
    private val sent = MmsMessageMapper.MESSAGE_BOX_SENT

    private fun addr(address: String, type: Int) = MmsMessageMapper.MmsAddress(address, type)

    @Test
    fun `resolveAddress joins distinct TO CC recipients for a sent group message`() {
        val addresses = listOf(
            addr("+351900000000", MmsMessageMapper.ADDRESS_TYPE_FROM), // this device
            addr("+351922222222", MmsMessageMapper.ADDRESS_TYPE_TO),
            addr("+351933333333", MmsMessageMapper.ADDRESS_TYPE_TO),
            addr("+351933333333", MmsMessageMapper.ADDRESS_TYPE_TO), // duplicate row
        )
        assertEquals("+351922222222, +351933333333", MmsMessageMapper.resolveAddress(addresses, sent))
    }

    @Test
    fun `resolveAddress uses FROM for an inbox message, never this device's own TO CC address`() {
        val addresses = listOf(
            addr("+351911111111", MmsMessageMapper.ADDRESS_TYPE_FROM), // the contact
            addr("+351900000000", MmsMessageMapper.ADDRESS_TYPE_TO), // this device — must never surface
        )
        assertEquals("+351911111111", MmsMessageMapper.resolveAddress(addresses, inbox))
    }

    @Test
    fun `resolveAddress falls back to whatever address exists when there is no FROM row`() {
        val addresses = listOf(addr("+351922222222", MmsMessageMapper.ADDRESS_TYPE_TO))
        assertEquals("+351922222222", MmsMessageMapper.resolveAddress(addresses, inbox))
    }

    @Test
    fun `resolveAddress returns empty string, not a crash, for an empty list`() {
        assertEquals("", MmsMessageMapper.resolveAddress(emptyList(), inbox))
        assertEquals("", MmsMessageMapper.resolveAddress(emptyList(), sent))
    }

    @Test
    fun `resolveBody joins text parts and skips blank ones`() {
        assertEquals("hello", MmsMessageMapper.resolveBody(listOf("hello", "", "  ")))
        assertEquals("hello\nworld", MmsMessageMapper.resolveBody(listOf("hello", "world")))
    }

    @Test
    fun `resolveBody returns the attachment marker for an image-only MMS`() {
        assertEquals(MmsMessageMapper.ATTACHMENT_MARKER, MmsMessageMapper.resolveBody(emptyList()))
        assertEquals(MmsMessageMapper.ATTACHMENT_MARKER, MmsMessageMapper.resolveBody(listOf("", "   ")))
    }

    @Test
    fun `toMessageMap normalizes seconds to milliseconds and tags kind mms`() {
        val map = MmsMessageMapper.toMessageMap(
            id = 42L,
            threadId = 7L,
            dateSeconds = 1_700_000_000L,
            messageBox = inbox,
            isRead = false,
            addresses = listOf(addr("+351911111111", MmsMessageMapper.ADDRESS_TYPE_FROM)),
            textParts = listOf("hi"),
        )
        assertEquals("42", map["id"])
        assertEquals("7", map["threadId"])
        assertEquals("+351911111111", map["address"])
        assertEquals("hi", map["body"])
        assertEquals(1_700_000_000_000L, map["date"])
        assertEquals(1, map["type"])
        assertEquals(false, map["isRead"])
        assertEquals("mms", map["kind"])
        assertTrue((map["dateFormatted"] as String).isNotBlank())
    }

    @Test
    fun `toMessageMap marks an image-only sent group MMS with the attachment marker and every recipient`() {
        val map = MmsMessageMapper.toMessageMap(
            id = 1L,
            threadId = 9L,
            dateSeconds = 1_700_000_100L,
            messageBox = sent,
            isRead = true,
            addresses = listOf(
                addr("+351900000000", MmsMessageMapper.ADDRESS_TYPE_FROM),
                addr("+351911111111", MmsMessageMapper.ADDRESS_TYPE_TO),
                addr("+351922222222", MmsMessageMapper.ADDRESS_TYPE_TO),
            ),
            textParts = emptyList(),
        )
        assertEquals(MmsMessageMapper.ATTACHMENT_MARKER, map["body"])
        assertEquals("+351911111111, +351922222222", map["address"])
    }

    @Test
    fun `toMessageMap on an inbox MMS with no text part shows the sender and the attachment marker`() {
        val map = MmsMessageMapper.toMessageMap(
            id = 2L,
            threadId = 9L,
            dateSeconds = 1_700_000_200L,
            messageBox = inbox,
            isRead = false,
            addresses = listOf(
                addr("+351911111111", MmsMessageMapper.ADDRESS_TYPE_FROM),
                addr("+351900000000", MmsMessageMapper.ADDRESS_TYPE_TO), // this device
            ),
            textParts = emptyList(),
        )
        assertEquals("+351911111111", map["address"])
        assertEquals(MmsMessageMapper.ATTACHMENT_MARKER, map["body"])
    }
}
