package com.iostoandroid.launcher

/**
 * Pure-JVM validation for the arguments to [LauncherModule.sendSms].
 * Kept free of android.* imports so it can be unit-tested without a device.
 */
object SmsRequestValidator {
    /** Returns a Portuguese error message when [address]/[body] are unusable, or null when valid. */
    fun validate(address: String, body: String): String? {
        if (address.isBlank()) return "SMS não enviado: destinatário vazio"
        if (body.isEmpty()) return "SMS não enviado: mensagem vazia"
        return null
    }
}
