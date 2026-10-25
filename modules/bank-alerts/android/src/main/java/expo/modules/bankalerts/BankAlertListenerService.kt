package expo.modules.bankalerts

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Android hands this every notification once the user has turned on Notification access for
 * FamSplit. It keeps only the ones that look like a payment and drops the rest immediately.
 */
class BankAlertListenerService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val source = sbn.packageName
    if (source == packageName || AlertFilter.isChatApp(source)) {
      return
    }
    val notification = sbn.notification
    if (notification.flags and (Notification.FLAG_GROUP_SUMMARY or Notification.FLAG_ONGOING_EVENT) != 0) {
      return
    }
    val extras = notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
    if (AlertFilter.isFromPerson(source, title)) {
      return
    }
    val text = AlertFilter.paymentText(source, title, body) ?: return

    val store = PendingAlerts(applicationContext)
    if (!store.remember(text, sbn.postTime)) {
      return
    }
    // Saved first, so nothing is lost whatever happens next. With FamSplit on screen the app takes it
    // and shows it; otherwise FamSplit's own notification says it is waiting.
    val pending = store.add(PendingAlert(text, source, PendingAlerts.iso(sbn.postTime)))
    if (!BankAlertsModule.nudgeApp()) {
      AlertNotifier.show(applicationContext, pending, store.texts)
    }
  }
}
