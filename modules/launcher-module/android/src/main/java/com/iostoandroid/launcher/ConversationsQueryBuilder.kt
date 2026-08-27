package com.iostoandroid.launcher

/**
 * Pure-JVM builder for the clauses that page the CONVERSATION LIST.
 *
 * Why this exists at all: the list of conversations was built by fetching the N
 * newest messages across the whole provider and grouping them in JS. That
 * cannot be right for any N — one chatty thread buries every other, so a phone
 * with a few hundred SMS simply did not show most of its conversations. Raising
 * N moves the cliff; it does not remove it.
 *
 * A conversation list needs one row PER THREAD, paged the way the messages
 * inside a thread already are (#927): keyset on the thread's newest message
 * date, never an OFFSET. An OFFSET desyncs the moment a message arrives
 * mid-scroll — the page boundary shifts and a thread is either shown twice or
 * skipped.
 *
 * Kept free of android.* imports so every clause is unit-testable without a
 * device, in the shape of [MessagesQueryBuilder].
 */
object ConversationsQueryBuilder {

    /**
     * Builds `(selection, selectionArgs)` for one page of the conversation list.
     *
     * [beforeDate] null selects the newest page; a value selects the page of
     * threads strictly older than it.
     *
     * The date column of the conversations view is in MILLISECONDS, unlike
     * `content://mms`, which stores SECONDS — a difference that silently
     * returns either everything or nothing if the caller guesses. The caller
     * passes milliseconds and this does no conversion; [Companion] is where a
     * conversion would have to live if the URI ever changes.
     */
    fun buildSelection(dateColumn: String, beforeDate: Double?): Pair<String?, Array<String>?> {
        if (beforeDate == null) return Pair(null, null)
        return Pair("$dateColumn < ?", arrayOf(beforeDate.toLong().toString()))
    }

    /**
     * Newest thread first, capped in SQL.
     *
     * The local providers are SQLite-backed and honour a "LIMIT n" suffix on
     * the sortOrder argument — the only way to cap rows with the
     * (Uri, projection, selection, selectionArgs, sortOrder) overload, and the
     * same approach [MessagesQueryBuilder.buildSortOrder] already relies on.
     */
    fun buildSortOrder(dateColumn: String, limit: Int): String =
        "$dateColumn DESC LIMIT ${sanitizeLimit(limit)}"

    /**
     * A limit that cannot produce broken SQL or an unbounded scan.
     *
     * The limit crosses the bridge from JS, so it arrives as whatever the caller
     * passed. Interpolating it into the sort order means a zero or a negative
     * would either error or, worse, be read as "no limit" and scan the whole
     * provider on the main thread.
     */
    fun sanitizeLimit(limit: Int): Int = when {
        limit < 1 -> 1
        limit > MAX_LIMIT -> MAX_LIMIT
        else -> limit
    }

    /** Beyond this a "page" is not a page; the caller should be paging instead. */
    const val MAX_LIMIT = 500
}
