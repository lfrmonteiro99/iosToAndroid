package com.iostoandroid.launcher

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM unit tests for [MessagesQueryBuilder] — no android.* imports, runs
 * without a device or the Android SDK.
 */
class MessagesQueryBuilderTest {

    @Test
    fun `digitsSuffix strips formatting and keeps the last 10 digits`() {
        assertEquals("912345678", MessagesQueryBuilder.digitsSuffix("912345678"))
        assertEquals("1912345678", MessagesQueryBuilder.digitsSuffix("+351912345678"))
        assertEquals("5551234567", MessagesQueryBuilder.digitsSuffix("(555) 123-4567"))
        assertEquals("", MessagesQueryBuilder.digitsSuffix("AMAZON"))
    }

    @Test
    fun `newest page matches on stripped address with no date clause`() {
        val (selection, args) = MessagesQueryBuilder.buildSelection("address", "date", "+351 912 345 678", null)
        assertTrue(selection.contains("LIKE ?"))
        assertTrue(selection.contains("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(address"))
        assertEquals(1, args.size)
        assertEquals("%1912345678", args[0]) // last-10-digit suffix, % prefix
    }

    @Test
    fun `older page adds a strictly-less-than date clause, not an offset`() {
        val (selection, args) = MessagesQueryBuilder.buildSelection("address", "date", "912345678", 1000.0)
        assertEquals(true, selection.endsWith("date < ?"))
        assertArrayEquals(arrayOf("%912345678", "1000"), args)
    }

    @Test
    fun `formatting differences produce the same selection args`() {
        // Same 10-digit number in three shapes: plain, human-formatted, and
        // E.164 with a 1-digit country code (which the last-10 truncation
        // absorbs cleanly, same as src/utils/contacts.ts#findContactByPhone).
        val (_, plain) = MessagesQueryBuilder.buildSelection("address", "date", "5551234567", null)
        val (_, formatted) = MessagesQueryBuilder.buildSelection("address", "date", "(555) 123-4567", null)
        val (_, prefixed) = MessagesQueryBuilder.buildSelection("address", "date", "+15551234567", null)
        assertArrayEquals(plain, formatted)
        assertArrayEquals(plain, prefixed)
    }

    @Test
    fun `alphanumeric sender id falls back to exact case-insensitive match`() {
        val (selection, args) = MessagesQueryBuilder.buildSelection("address", "date", "AMAZON", null)
        assertEquals("UPPER(address) = UPPER(?)", selection)
        assertArrayEquals(arrayOf("AMAZON"), args)
    }

    @Test
    fun `sort order appends LIMIT instead of relying on a client-side loop cutoff`() {
        assertEquals("date DESC LIMIT 50", MessagesQueryBuilder.buildSortOrder("date", 50))
        assertEquals("date DESC LIMIT 1", MessagesQueryBuilder.buildSortOrder("date", 1))
    }
}
