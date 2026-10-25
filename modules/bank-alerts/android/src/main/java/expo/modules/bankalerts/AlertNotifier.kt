package expo.modules.bankalerts

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build

/** FamSplit's own notification: "Add this payment to FamSplit?", which opens the Bank payments list. */
object AlertNotifier {
  private const val CHANNEL = "bank_alerts"
  private const val NOTIFICATION_ID = 7301

  fun show(context: Context, pending: List<PendingAlert>, texts: NotificationTexts) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val latest = pending.lastOrNull() ?: return
    if (!manager.areNotificationsEnabled()) {
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL, texts.channel, NotificationManager.IMPORTANCE_DEFAULT))
    }

    val open = Intent(Intent.ACTION_VIEW, Uri.parse("famsplit://detected")).setPackage(context.packageName)
    val tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val title = if (pending.size == 1) texts.one else texts.many.replace("{count}", pending.size.toString())
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon

    @Suppress("DEPRECATION")
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL) else Notification.Builder(context)
    val notification = builder
      .setSmallIcon(icon)
      .setColor(Color.parseColor("#6C4DF6"))
      .setContentTitle(title)
      .setContentText(latest.text)
      .setStyle(Notification.BigTextStyle().bigText(latest.text))
      .setContentIntent(tap)
      .setAutoCancel(true)
      .setOnlyAlertOnce(false)
      .build()
    manager.notify(NOTIFICATION_ID, notification)
  }

  fun clear(context: Context) {
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID)
  }
}
