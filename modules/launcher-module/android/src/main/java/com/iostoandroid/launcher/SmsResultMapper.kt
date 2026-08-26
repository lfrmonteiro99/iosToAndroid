package com.iostoandroid.launcher

/**
 * Pure-JVM mapping from an SMS `sentIntent` broadcast `resultCode` to a
 * semantic send outcome, plus the multipart aggregation rule (one failed
 * part fails the whole send). Kept free of android.* imports, like
 * [SmsRequestValidator], so it can be unit-tested without a device — the
 * numeric constants below are copies of android.app.Activity.RESULT_OK and
 * android.telephony.SmsManager.RESULT_ERROR_* (verified via `javap -constants`
 * against android.jar, not guessed).
 */
object SmsResultMapper {
    const val RESULT_OK = -1
    const val RESULT_ERROR_GENERIC_FAILURE = 1
    const val RESULT_ERROR_RADIO_OFF = 2
    const val RESULT_ERROR_NULL_PDU = 3
    const val RESULT_ERROR_NO_SERVICE = 4

    data class Outcome(val success: Boolean, val reason: String?)

    /** Maps a single `sentIntent` resultCode to a distinguishable outcome. */
    fun map(resultCode: Int): Outcome = when (resultCode) {
        RESULT_OK -> Outcome(true, null)
        RESULT_ERROR_NO_SERVICE -> Outcome(false, "no_service")
        RESULT_ERROR_RADIO_OFF -> Outcome(false, "radio_off")
        RESULT_ERROR_NULL_PDU -> Outcome(false, "pdu_error")
        RESULT_ERROR_GENERIC_FAILURE -> Outcome(false, "generic_failure")
        else -> Outcome(false, "unknown_error")
    }

    /**
     * Aggregates one resultCode per multipart part: success only when every
     * part reported RESULT_OK. The first non-OK part's mapped reason wins.
     * An empty list (no parts ever reported) is a failure, not a vacuous
     * success.
     */
    fun aggregate(resultCodes: List<Int>): Outcome {
        if (resultCodes.isEmpty()) return Outcome(false, "no_parts")
        val firstFailure = resultCodes.firstOrNull { it != RESULT_OK } ?: return Outcome(true, null)
        return map(firstFailure)
    }
}
