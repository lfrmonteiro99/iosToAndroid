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
        val activeNotifications = mutableListOf<NotificationData>()
        var instance: NotificationService? = null

        fun getNotificationMaps(): List<Map<String, Any?>> {
            return activeNotifications.map { it.toMap() }
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

        activeNotifications.removeAll { n -> n.id == data.id && n.packageName == data.packageName }
        activeNotifications.add(0, data)

        while (activeNotifications.size > 50) {
            activeNotifications.removeAt(activeNotifications.lastIndex)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        val id = sbn.id.toString()
        val pkg = sbn.packageName
        activeNotifications.removeAll { n -> n.id == id && n.packageName == pkg }
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }
}
