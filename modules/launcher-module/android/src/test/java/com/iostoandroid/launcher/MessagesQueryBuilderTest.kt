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
    fun `digitsSuffix strips formatting and keeps the last 9 digits`() {
        assertEquals("912345678", MessagesQueryBuilder.digitsSuffix("912345678"))
        assertEquals("912345678", MessagesQueryBuilder.digitsSuffix("+351912345678"))
        assertEquals("551234567", MessagesQueryBuilder.digitsSuffix("(555) 123-4567"))
        assertEquals("", MessagesQueryBuilder.digitsSuffix("AMAZON"))
    }

    @Test
    fun `the two ways a Portuguese number is stored produce the SAME suffix`() {
        // The reported bug: open a conversation, nothing shows.
        //
        // This asserted 10 digits, which pinned the defect. `+351912345678` cut
        // to ten keeps `1912345678` — the trailing `1` of the 351 country code —
        // while the same number stored nationally cuts to `912345678`. The
        // selection built from the first is `... LIKE '%1912345678'`, which
        // cannot match a nine-character value, so a thread whose rows are in
        // national format returned zero rows.
        val national = MessagesQueryBuilder.digitsSuffix("912345678")
        val international = MessagesQueryBuilder.digitsSuffix("+351912345678")
        val spaced = MessagesQueryBuilder.digitsSuffix("+351 912 345 678")
        assertEquals(national, international)
        assertEquals(national, spaced)
    }

    @Test
    fun `native agrees with the JS key that MessagesScreen groups by`() {
        // src/utils/contacts.ts#normalizePhoneKey:
        //   digits.length > 9 ? digits.slice(-9) : digits
        //
        // MessagesScreen groups conversations with that key and then navigates
        // with the provider's RAW address, which lands here. If the two cuts
        // disagree, the grouping and the query disagree about what one
        // conversation is — which is the whole bug, not a detail.
        assertEquals(9, MessagesQueryBuilder.ADDRESS_DIGITS)
    }

    @Test
    fun `a suffix is never longer than the address it came from`() {
        // Stated as a property because that is the actual failure mode: a suffix
        // longer than the stored value makes `LIKE '%suffix'` unsatisfiable, and
        // an unsatisfiable LIKE is silent — an empty conversation, not an error.
        for (address in listOf("912345678", "+351912345678", "(555) 123-4567", "1234", "+1 555 123 4567")) {
            val digits = address.filter { it.isDigit() }
            assertTrue(
                "suffix for $address must not exceed its own digits",
                MessagesQueryBuilder.digitsSuffix(address).length <= digits.length,
            )
        }
    }

    @Test
    fun `newest page matches on stripped address with no date clause`() {
        val (selection, args) = MessagesQueryBuilder.buildSelection("address", "date", "+351 912 345 678", null)
        assertTrue(selection.contains("LIKE ?"))
        assertTrue(selection.contains("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(address"))
        assertEquals(1, args.size)
        assertEquals("%912345678", args[0]) // last-9-digit suffix, % prefix
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
