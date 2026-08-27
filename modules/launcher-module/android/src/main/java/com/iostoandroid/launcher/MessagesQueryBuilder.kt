package com.iostoandroid.launcher

/**
 * Pure-JVM builder for the SQL selection/sort clauses [LauncherModule] uses to
 * page through a single SMS conversation instead of scanning the whole
 * `content://sms` table. Kept free of android.* imports so it can be
 * unit-tested without a device.
 *
 * Address matching tolerates formatting (spaces, dashes, parentheses, a
 * leading +) by comparing the last NINE digits — the same heuristic as
 * src/utils/contacts.ts#normalizePhoneKey, so JS and native agree on what
 * counts as "the same number".
 *
 * NINE, not ten. This said ten and claimed to mirror the JS, which keeps nine
 * (`digits.length > 9 ? digits.slice(-9) : digits`). The two disagreed, and a
 * Portuguese number is exactly where that shows: a national number is nine
 * digits, so `+351912345678` cut to ten keeps `1912345678` — the trailing `1`
 * of the `351` country code — while the same number stored as `912345678` cuts
 * to `912345678`. The selection built from the first is
 * `... LIKE '%1912345678'`, which cannot match a nine-character value, so a
 * conversation whose rows are in national format returned ZERO rows and opened
 * empty. MessagesScreen groups conversations with the JS nine-digit key and
 * then navigates with the provider's raw address, so which of the two forms
 * reached this builder was down to how the newest message in the thread
 * happened to be stored.
 *
 * Nine is also the safer of the two in general: it is what every JS caller
 * already uses, so grouping and querying cannot drift apart, and one digit of
 * extra tolerance only ever risks collapsing two numbers that differ solely in
 * the tenth-from-last digit.
 *
 * Alphanumeric sender IDs (bank/service SMS with no digits at all) fall back to
 * an exact, case-insensitive match — a digit-suffix match would otherwise
 * degenerate to "any address" and return every conversation.
 */
object MessagesQueryBuilder {
    private val NON_DIGITS = Regex("[^0-9]")
    private val FORMAT_CHARS = arrayOf(" ", "-", "(", ")", "+")

    /**
     * The number of trailing digits two addresses must share to be the same
     * number. Mirrors src/utils/contacts.ts#normalizePhoneKey — see the note on
     * this object for why it is nine and not ten.
     */
    const val ADDRESS_DIGITS = 9

    /** Strips non-digit characters, keeping at most the last [ADDRESS_DIGITS]. */
    fun digitsSuffix(address: String): String {
        val digits = address.replace(NON_DIGITS, "")
        return if (digits.length > ADDRESS_DIGITS) digits.takeLast(ADDRESS_DIGITS) else digits
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
