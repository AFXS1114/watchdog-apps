package com.watchdogchild

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class UsageStatsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WatchdogUsageStats"

    // ── Permission check ──────────────────────────────────────────────────

    @ReactMethod
    fun hasUsageStatsPermission(promise: Promise) {
        try {
            val appOps = reactApplicationContext
                .getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    reactApplicationContext.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    reactApplicationContext.packageName
                )
            }
            promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
        } catch (e: Exception) {
            promise.reject("USAGE_STATS_ERROR", e.message, e)
        }
    }

    // ── Open settings ─────────────────────────────────────────────────────

    @ReactMethod
    fun openUsageAccessSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.message, e)
        }
    }

    // ── Query recent events ───────────────────────────────────────────────

    @ReactMethod
    fun queryRecentEvents(windowMs: Double, promise: Promise) {
        try {
            val usm = reactApplicationContext
                .getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

            val now = System.currentTimeMillis()
            val begin = now - windowMs.toLong()

            val usageEvents = usm.queryEvents(begin, now)
            val result: WritableArray = Arguments.createArray()
            val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }

            val event = UsageEvents.Event()
            val pm = reactApplicationContext.packageManager

            while (usageEvents.hasNextEvent()) {
                usageEvents.getNextEvent(event)

                val eventType = when (event.eventType) {
                    UsageEvents.Event.ACTIVITY_RESUMED -> "ACTIVITY_RESUMED"
                    UsageEvents.Event.ACTIVITY_PAUSED  -> "ACTIVITY_PAUSED"
                    UsageEvents.Event.ACTIVITY_STOPPED -> "ACTIVITY_STOPPED"
                    else -> "OTHER"
                }

                // Only surface meaningful events
                if (eventType == "OTHER") continue

                val map = Arguments.createMap().apply {
                    putString("packageName", event.packageName)
                    putString("eventType", eventType)
                    putString("timestamp", iso.format(Date(event.timeStamp)))

                    // Try to resolve a human-readable label
                    val label = try {
                        val appInfo = pm.getApplicationInfo(event.packageName, 0)
                        pm.getApplicationLabel(appInfo).toString()
                    } catch (_: Exception) { null }
                    if (label != null) putString("appLabel", label)
                    else putNull("appLabel")
                }
                result.pushMap(map)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("USAGE_QUERY_ERROR", e.message, e)
        }
    }
}
