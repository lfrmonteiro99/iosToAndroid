package com.iostoandroid.launcher

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Pure-JVM mapping from MMS row/addr/part data to the same message shape
 * [LauncherModule.queryMessages] emits for SMS, so a conversation can merge
 * and sort both kinds by `date` without gaps (#931). Kept free of android.*
 * imports so it can be unit-tested without a device — see
 * [MessagesQueryBuilder] for the SMS-side counterpart.
 *
 * `Telephony.Mms.DATE` is seconds since epoch (`Telephony.Sms.DATE` is
 * milliseconds) — [toMessageMap] normalizes to milliseconds so SMS and MMS
 * rows sort correctly once merged.
 */
object MmsMessageMapper {
    // android.provider.Telephony.Mms.Addr#TYPE values (PduHeaders), duplicated
    // as plain constants instead of imported so this object stays free of
    // android.* imports.
    const val ADDRESS_TYPE_BCC = 129
    const val ADDRESS_TYPE_CC = 130
    const val ADDRESS_TYPE_FROM = 137
    const val ADDRESS_TYPE_TO = 151

    // android.provider.Telephony.Mms#MESSAGE_BOX_SENT, duplicated for the
    // same reason as the ADDRESS_TYPE_* constants above.
    const val MESSAGE_BOX_SENT = 2

    // #931 explicitly leaves loading/showing attachment binaries out of scope
    // — this marker replaces an empty body so an image-only MMS isn't shown
    // as if no message existed at all.
    const val ATTACHMENT_MARKER = "📎 Attachment"

    data class MmsAddress(val address: String, val type: Int)

    /**
     * For a message this device sent, the joined TO/CC recipients (de-duped)
     * — this is what makes a sent group MMS show every participant instead
     * of just one. For anything else (inbox, and any other box), the sender
     * (FROM) is the conversation partner, mirroring how `Telephony.Sms.ADDRESS`
     * already behaves for an inbox SMS.
     *
     * Deliberately does NOT fall back to TO/CC for an inbox message: this
     * device's own number isn't known here (no READ_PHONE_STATE lookup in
     * this module), and an inbox message's TO/CC rows are typically that own
     * number — falling back to them would show the user their own number as
     * if it were the other party.
     */
    fun resolveAddress(addresses: List<MmsAddress>, messageBox: Int): String {
        if (messageBox == MESSAGE_BOX_SENT) {
            val recipients = addresses
                .filter { it.type == ADDRESS_TYPE_TO || it.type == ADDRESS_TYPE_CC }
                .map { it.address }
                .distinct()
            if (recipients.isNotEmpty()) return recipients.joinToString(", ")
        }
        return addresses.firstOrNull { it.type == ADDRESS_TYPE_FROM }?.address
            ?: addresses.firstOrNull()?.address
            ?: ""
    }

    /** Concatenated non-blank text/plain parts, or [ATTACHMENT_MARKER] when there is none. */
    fun resolveBody(textParts: List<String>): String {
        val text = textParts.filter { it.isNotBlank() }.joinToString("\n")
        return text.ifBlank { ATTACHMENT_MARKER }
    }

    fun toMessageMap(
        id: Long,
        threadId: Long,
        dateSeconds: Long,
        messageBox: Int,
        isRead: Boolean,
        addresses: List<MmsAddress>,
        textParts: List<String>,
    ): Map<String, Any?> {
        val dateMillis = dateSeconds * 1000L
        return mapOf(
            "id" to id.toString(),
            "threadId" to threadId.toString(),
            "address" to resolveAddress(addresses, messageBox),
            "body" to resolveBody(textParts),
            "date" to dateMillis,
            "dateFormatted" to SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(Date(dateMillis)),
            "type" to messageBox,
            "isRead" to isRead,
            "kind" to "mms",
        )
    }
}
