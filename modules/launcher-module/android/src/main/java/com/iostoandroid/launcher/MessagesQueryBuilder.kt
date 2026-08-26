package com.iostoandroid.launcher

/**
 * Pure-JVM builder for the SQL selection/sort clauses [LauncherModule] uses to
 * page through a single SMS conversation instead of scanning the whole
 * `content://sms` table. Kept free of android.* imports so it can be
 * unit-tested without a device.
 *
 * Address matching tolerates formatting (spaces, dashes, parentheses, a
 * leading +) by comparing the last 10 digits — the same heuristic as
 * src/utils/contacts.ts#findContactByPhone, so JS and native agree on what
 * counts as "the same number" (#928 owns making that comparison exact; this
 * mirrors its contract rather than redefining it). Alphanumeric sender IDs
 * (bank/service SMS with no digits at all) fall back to an exact,
 * case-insensitive match — a digit-suffix match would otherwise degenerate to
 * "any address" and return every conversation.
 */
object MessagesQueryBuilder {
    private val NON_DIGITS = Regex("[^0-9]")
    private val FORMAT_CHARS = arrayOf(" ", "-", "(", ")", "+")

    /** Strips non-digit characters, keeping at most the last 10. */
    fun digitsSuffix(address: String): String {
        val digits = address.replace(NON_DIGITS, "")
        return if (digits.length > 10) digits.takeLast(10) else digits
    }

    /**
     * Builds the `(selection, selectionArgs)` pair for one page of a thread.
     * [beforeDate] null selects the newest page; a value selects the page
     * strictly older than it — keyset pagination, not an OFFSET, so a new
     * incoming SMS mid-scroll can't shift the page boundary.
     */
    fun buildSelection(
        addressColumn: String,
        dateColumn: String,
        address: String,
        beforeDate: Double?,
    ): Pair<String, Array<String>> {
        val suffix = digitsSuffix(address)
        val addressClause: String
        val addressArg: String
        if (suffix.isEmpty()) {
            addressClause = "UPPER($addressColumn) = UPPER(?)"
            addressArg = address
        } else {
            var strippedColumn = addressColumn
            for (ch in FORMAT_CHARS) {
                strippedColumn = "REPLACE($strippedColumn, '$ch', '')"
            }
            addressClause = "$strippedColumn LIKE ?"
            addressArg = "%$suffix"
        }

        return if (beforeDate == null) {
            Pair(addressClause, arrayOf(addressArg))
        } else {
            Pair("$addressClause AND $dateColumn < ?", arrayOf(addressArg, beforeDate.toLong().toString()))
        }
    }

    /**
     * The local SMS provider is SQLite-backed and honors a "LIMIT n" suffix
     * appended to the sortOrder argument of ContentResolver.query — the only
     * way to cap rows at the query level with the (Uri, projection, selection,
     * selectionArgs, sortOrder) overload used here.
     */
    fun buildSortOrder(dateColumn: String, limit: Int): String = "$dateColumn DESC LIMIT $limit"
}
