package com.iostoandroid.launcher

import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

data class NotificationData(
    val id: String,
    val key: String,
    val packageName: String,
    val title: String,
    val text: String,
    val time: Long,
    val isOngoing: Boolean
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "id" to id,
        "key" to key,
        "packageName" to packageName,
        "title" to title,
        "text" to text,
        "time" to time,
        "isOngoing" to isOngoing
    )
}

class NotificationService : NotificationListenerService() {
    companion object {
        private val notifications = java.util.concurrent.CopyOnWriteArrayList<NotificationData>()
        var instance: NotificationService? = null

        fun getNotificationMaps(): List<Map<String, Any?>> {
            return notifications.map { it.toMap() }
        }

        fun dismissNotification(key: String): Boolean {
            val svc = instance ?: return false
            try {
                svc.cancelNotification(key)
                return true
            } catch (e: Exception) {
                return false
            }
        }

        fun dismissAllNotifications(): Boolean {
            val svc = instance ?: return false
            try {
                svc.cancelAllNotifications()
                notifications.clear()
                return true
            } catch (e: Exception) {
                return false
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    private fun emitToJS(eventName: String, sbn: StatusBarNotification) {
        try {
            val extras = sbn.notification.extras
            val bundle = Bundle().apply {
                putString("id", sbn.key)
                putString("packageName", sbn.packageName)
                putString("title", extras.getCharSequence("android.title")?.toString() ?: "")
                putString("text", extras.getCharSequence("android.text")?.toString() ?: "")
                putDouble("postedAt", sbn.postTime.toDouble())
            }
            LauncherModule.emitEvent(eventName, bundle)
        } catch (e: Exception) {
            // Silently ignore — JS bridge may not be ready yet
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val data = NotificationData(
            id = sbn.id.toString(),
            key = sbn.key,
            packageName = sbn.packageName,
            title = extras.getCharSequence("android.title")?.toString() ?: "",
            text = extras.getCharSequence("android.text")?.toString() ?: "",
            time = sbn.postTime,
            isOngoing = sbn.isOngoing
        )

        // Remove existing with same id+package using iterator
        val iter = notifications.iterator()
        while (iter.hasNext()) {
            val existing = iter.next()
            if (existing.id == data.id && existing.packageName == data.packageName) {
                notifications.remove(existing)
            }
        }

        notifications.add(0, data)

        // Trim to max 50
        while (notifications.size > 50) {
            notifications.removeAt(notifications.size - 1)
        }

        emitToJS("onNotificationPosted", sbn)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        val targetId = sbn.id.toString()
        val targetPkg = sbn.packageName
        val iter = notifications.iterator()
        while (iter.hasNext()) {
            val existing = iter.next()
            if (existing.id == targetId && existing.packageName == targetPkg) {
                notifications.remove(existing)
            }
        }

        emitToJS("onNotificationRemoved", sbn)
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }
}
