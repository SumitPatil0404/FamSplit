package expo.modules.bankalerts

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CopyOnWriteArraySet

class BankAlertsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

  // Per instance: a development build can have more than one, such as the dev menu's own copy.
  @Volatile private var observing = false
  @Volatile private var onScreen = false

  override fun definition() = ModuleDefinition {
    Name("BankAlerts")

    Events("onAlert")

    OnCreate { instances.add(this@BankAlertsModule) }
    OnDestroy { instances.remove(this@BankAlertsModule) }
    OnStartObserving("onAlert") { observing = true }
    OnStopObserving("onAlert") { observing = false }
    OnActivityEntersForeground { onScreen = true }
    OnActivityEntersBackground { onScreen = false }

    /** Whether the user has turned on Notification access for FamSplit. */
    Function("isEnabled") {
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
      enabled.split(":").mapNotNull { ComponentName.unflattenFromString(it) }.any { it.packageName == context.packageName }
    }

    /** Opens Android's Notification access page, on FamSplit's own entry where the phone allows it. */
    Function("openSettings") {
      val component = ComponentName(context, BankAlertListenerService::class.java)
      // Some phones do not have the detail page; the list works everywhere.
      val openedDetail = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && runCatching {
        context.startActivity(
          Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
            .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component.flattenToString())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      }.isSuccess
      if (!openedDetail) {
        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    /** Everything that arrived while the app was closed; clears the list and FamSplit's notification. */
    Function("takePending") {
      AlertNotifier.clear(context)
      PendingAlerts(context).take().map { it.toMap() }
    }

    /** The words FamSplit's own notification uses, so it matches the app's language. */
    Function("setTexts") { one: String, many: String, channel: String ->
      PendingAlerts(context).texts = NotificationTexts(one, many, channel)
    }
  }

  companion object {
    private val instances = CopyOnWriteArraySet<BankAlertsModule>()

    /**
     * Tells the app a new alert is waiting, if FamSplit is on screen and listening; it then takes it
     * with takePending. Returns false when the app is not showing, so a notification is needed.
     */
    fun nudgeApp(): Boolean {
      val listening = instances.filter { it.observing && it.onScreen }
      listening.forEach { it.sendEvent("onAlert", emptyMap<String, Any?>()) }
      return listening.isNotEmpty()
    }
  }
}
