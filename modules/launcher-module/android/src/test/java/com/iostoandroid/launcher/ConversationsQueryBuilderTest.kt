package com.iostoandroid.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The conversation list was built by fetching the N newest messages across the
 * whole provider and grouping them in JS, so most conversations on a busy phone
 * were absent. These clauses page one row PER THREAD instead.
 */
class ConversationsQueryBuilderTest {

    @Test
    fun `the newest page has no date clause`() {
        val (selection, args) = ConversationsQueryBuilder.buildSelection("date", null)
        assertNull(selection)
        assertNull(args)
    }

    @Test
    fun `an older page is keyset, not offset`() {
        // Keyset, because an OFFSET shifts the page boundary the moment a
        // message arrives mid-scroll: a thread is then shown twice or skipped.
        val (selection, args) = ConversationsQueryBuilder.buildSelection("date", 1_700_000_000_000.0)
        assertEquals("date < ?", selection)
        assertEquals(1, args!!.size)
        assertEquals("1700000000000", args[0])
    }

    @Test
    fun `the date argument keeps millisecond precision`() {
        // Truncating to seconds here would drop threads sharing a second with
        // the boundary, which is exactly the page seam.
        val (_, args) = ConversationsQueryBuilder.buildSelection("date", 1_700_000_000_123.0)
        assertEquals("1700000000123", args!![0])
    }

    @Test
    fun `sort order is newest first with the limit in SQL`() {
        assertEquals("date DESC LIMIT 30", ConversationsQueryBuilder.buildSortOrder("date", 30))
    }

    @Test
    fun `a zero or negative limit cannot become an unbounded scan`() {
        // The limit crosses the bridge from JS. Interpolated raw, a 0 or a -1
        // either errors or reads as "no limit" and scans the whole provider on
        // the main thread.
        assertEquals(1, ConversationsQueryBuilder.sanitizeLimit(0))
        assertEquals(1, ConversationsQueryBuilder.sanitizeLimit(-40))
        assertTrue(ConversationsQueryBuilder.buildSortOrder("date", 0).endsWith("LIMIT 1"))
    }

    @Test
    fun `an absurd limit is capped rather than honoured`() {
        assertEquals(
            ConversationsQueryBuilder.MAX_LIMIT,
            ConversationsQueryBuilder.sanitizeLimit(100_000),
        )
    }

    @Test
    fun `an ordinary limit passes through untouched`() {
        assertEquals(30, ConversationsQueryBuilder.sanitizeLimit(30))
        assertEquals(ConversationsQueryBuilder.MAX_LIMIT, ConversationsQueryBuilder.sanitizeLimit(ConversationsQueryBuilder.MAX_LIMIT))
    }
}
