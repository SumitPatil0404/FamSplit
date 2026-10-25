package expo.modules.bankalerts

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** A payment alert waiting for the app to open and pick it up. */
data class PendingAlert(val text: String, val source: String, val seenAt: String) {
  fun toMap() = mapOf("text" to text, "source" to source, "seenAt" to seenAt)
}

/**
 * Payment alerts that arrived while the app was closed, kept on the phone until the app takes them.
 * Also remembers recent alert texts, because Android often posts the same notification again
 * when it is updated.
 */
class PendingAlerts(context: Context) {
  private val prefs = context.getSharedPreferences("famsplit.bankAlerts", Context.MODE_PRIVATE)

  fun all(): List<PendingAlert> {
    val array = JSONArray(prefs.getString(PENDING, "[]"))
    return (0 until array.length()).map { index ->
      val item = array.getJSONObject(index)
      PendingAlert(item.getString("text"), item.getString("source"), item.getString("seenAt"))
    }
  }

  /** Keeps the alert until the app opens, and returns everything now waiting. */
  @Synchronized
  fun add(alert: PendingAlert): List<PendingAlert> {
    val pending = all().takeLast(MAX_PENDING - 1) + alert
    prefs.edit().putString(PENDING, JSONArray(pending.map { JSONObject(it.toMap()) }).toString()).apply()
    return pending
  }

  /** Hands over everything waiting and forgets it. */
  @Synchronized
  fun take(): List<PendingAlert> {
    val pending = all()
    prefs.edit().remove(PENDING).apply()
    return pending
  }

  /** Records the text as seen; false if it already was within the last day. */
  @Synchronized
  fun remember(text: String, postedAt: Long): Boolean {
    val array = JSONArray(prefs.getString(RECENT, "[]"))
    val recent = (0 until array.length())
      .map { array.getJSONObject(it) }
      .filter { postedAt - it.getLong("at") < REMEMBER_MS }
    if (recent.any { it.getString("text") == text }) {
      return false
    }
    val next = recent.takeLast(MAX_RECENT - 1) + JSONObject(mapOf("text" to text, "at" to postedAt))
    prefs.edit().putString(RECENT, JSONArray(next).toString()).apply()
    return true
  }

  /** The words for FamSplit's own notification, in the language the app is set to. */
  var texts: NotificationTexts
    get() = NotificationTexts(
      prefs.getString("textOne", null) ?: "Add this payment to FamSplit?",
      prefs.getString("textMany", null) ?: "{count} payments to add to FamSplit",
      prefs.getString("textChannel", null) ?: "Bank payments",
    )
    set(value) {
      prefs.edit()
        .putString("textOne", value.one)
        .putString("textMany", value.many)
        .putString("textChannel", value.channel)
        .apply()
    }

  companion object {
    fun iso(time: Long): String =
      SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(time))

    private const val PENDING = "pending"
    private const val RECENT = "recent"
    private const val MAX_PENDING = 50
    private const val MAX_RECENT = 100
    private const val REMEMBER_MS = 24 * 60 * 60 * 1000L
  }
}

data class NotificationTexts(val one: String, val many: String, val channel: String)
