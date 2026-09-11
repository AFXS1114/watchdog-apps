package com.watchdogchild

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Android 14+ requires a foreground service of type "mediaProjection" to be
 * running *before* the MediaProjection consent dialog is shown.
 *
 * This service simply shows a persistent notification while the projection
 * session is active. It is started by ScreenCaptureModule right before calling
 * createScreenCaptureIntent(), and stopped if the user denies permission,
 * or when the projection is explicitly released.
 */
class ScreenCaptureForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "watchdog_capture_channel"
        private const val NOTIFICATION_ID = 2001
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = createNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Screen Capture"
            val descriptionText = "Service for screen capture"
            val importance = NotificationManager.IMPORTANCE_LOW
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
            }
            val notificationManager: NotificationManager =
                getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Watchdog Screen Monitor")
            .setContentText("Screen monitoring is active")
            .setSmallIcon(R.mipmap.ic_launcher) // Assuming default icon exists
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }
}
