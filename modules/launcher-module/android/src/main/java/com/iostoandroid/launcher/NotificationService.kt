package com.iostoandroid.launcher

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

data class NotificationData(
    val id: String,
    val packageName: String,
    val title: String,
    val text: String,
    val time: Long,
    val isOngoing: Boolean
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "id" to id,
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
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val data = NotificationData(
            id = sbn.id.toString(),
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
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }
}
