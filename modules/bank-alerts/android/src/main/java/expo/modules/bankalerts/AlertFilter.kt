package expo.modules.bankalerts

/**
 * Decides which notifications could be a payment. Anything that fails is dropped on the spot and
 * never stored. The app's own parser (src/domain/bank-alert.ts) makes the final call, so these
 * rules only need to be a little looser than it is, never stricter.
 */
object AlertFilter {
  /** People chat about money in these apps; a friend typing "I paid ₹500" is not a bank alert. */
  private val CHAT_APPS = setOf(
    "com.whatsapp",
    "com.whatsapp.w4b",
    "org.telegram.messenger",
    "org.telegram.messenger.web",
    "org.thunderdog.challegram",
    "com.instagram.android",
    "com.instagram.barcelona",
    "com.facebook.orca",
    "com.facebook.katana",
    "org.thoughtcrime.securesms",
    "com.snapchat.android",
    "com.discord",
    "com.Slack",
    "com.microsoft.teams",
    "com.google.android.apps.dynamite",
    "jp.naver.line.android",
    "com.viber.voip",
    "com.tencent.mm",
    "com.twitter.android",
    "com.linkedin.android",
  )

  /** SMS apps, where a message from a phone number is a person rather than a bank. */
  private val SMS_APPS = setOf(
    "com.google.android.apps.messaging",
    "com.samsung.android.messaging",
    "com.android.mms",
    "com.android.messaging",
    "com.oneplus.mms",
    "com.truecaller",
  )

  /** Same as NOT_A_PAYMENT in bank-alert.ts: OTPs, offers, reminders, requests and failed payments. */
  private val NOT_A_PAYMENT = Regex(
    "\\b(otp|one[- ]time password|verification code|will be|is due|due on|due date|scheduled|requested|request|failed|declined|unsuccessful|reversed|up ?to|pre-?approved|loan offer|apply now)\\b",
    RegexOption.IGNORE_CASE,
  )
  private val MONEY_MOVED = Regex(
    "\\b(credited|received|deposited|refunded|debited|spent|paid|sent|withdrawn|transferred|purchase)\\b",
    RegexOption.IGNORE_CASE,
  )
  private val AMOUNT = Regex("(?:\\brs\\.?|\\binr|₹)\\s*\\d|\\b(?:debited|credited)\\s+(?:by|for|with)\\s+\\d", RegexOption.IGNORE_CASE)
  private val PHONE_NUMBER = Regex("^[+\\d\\s()-]+$")

  fun isChatApp(packageName: String) = packageName in CHAT_APPS

  /** "+91 98765 43210" is a person; "VM-HDFCBK" and "57575711" are senders banks use. */
  fun isFromPerson(packageName: String, title: String): Boolean =
    packageName in SMS_APPS && PHONE_NUMBER.matches(title.trim()) && title.count { it.isDigit() } >= 10

  /**
   * The text to keep, or null if this is not a payment. In an SMS app the title is only the sender
   * ("VM-HDFCBK"), so the message is enough. A UPI app may put the name in the title and the rest in
   * the text ("Rahul Sharma" / "paid you ₹500"), so the two are kept together when they read as one.
   */
  fun paymentText(packageName: String, title: String, text: String): String? {
    val candidates = if (packageName in SMS_APPS) listOf(text) else listOf("$title $text".trim(), text)
    return candidates.firstOrNull { looksLikePayment(it) }
  }

  private fun looksLikePayment(text: String): Boolean =
    text.isNotBlank() && AMOUNT.containsMatchIn(text) && MONEY_MOVED.containsMatchIn(text) && !NOT_A_PAYMENT.containsMatchIn(text)
}
