package com.iostoandroid.launcher

/**
 * Pure-JVM validation for phone numbers passed to [LauncherModule.makeCall].
 * Kept free of android.* imports so it can be unit-tested without a device.
 *
 * Accepts dial-string characters only: digits, +, *, #, spaces, parentheses,
 * hyphens, and dots — capped at 20 characters to match ITU-T E.164.
 * # is intentionally allowed (MMI codes such as *#06#).
 */
object PhoneNumberValidator {
    val PHONE_REGEX = Regex("^[+0-9*#(). -]{1,20}$")

    /** True when [number] looks like a plausible dial string. */
    fun isValidShape(number: String): Boolean = PHONE_REGEX.matches(number)
}
