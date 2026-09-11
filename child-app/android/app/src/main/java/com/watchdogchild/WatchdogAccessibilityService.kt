package com.watchdogchild

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * System-level AccessibilityService that monitors:
 *   1. Foreground app changes (TYPE_WINDOW_STATE_CHANGED)
 *   2. Browser URL bar content (TYPE_WINDOW_CONTENT_CHANGED in known browsers)
 *
 * Events are forwarded to React Native via DeviceEventEmitter so the JS layer
 * can enqueue them for upload.
 */
class WatchdogAccessibilityService : AccessibilityService() {

    companion object {
        /** Singleton reference — non-null while the service is alive. */
        @Volatile
        var instance: WatchdogAccessibilityService? = null
            private set

        fun isRunning(): Boolean = instance != null
    }

    private var lastPackage: String? = null
    private var lastUrl: String? = null

    // Known browser address-bar view IDs  (package → resource-id)
    private val browserUrlIds = mapOf(
        "com.android.chrome"           to "com.android.chrome:id/url_bar",
        "com.chrome.beta"              to "com.chrome.beta:id/url_bar",
        "com.chrome.dev"               to "com.chrome.dev:id/url_bar",
        "com.chrome.canary"            to "com.chrome.canary:id/url_bar",
        "com.sec.android.app.sbrowser" to "com.sec.android.app.sbrowser:id/location_bar_edit_text",
        "org.mozilla.firefox"          to "org.mozilla.firefox:id/url_bar_title",
        "org.mozilla.firefox_beta"     to "org.mozilla.firefox_beta:id/url_bar_title",
        "com.microsoft.emmx"           to "com.microsoft.emmx:id/url_bar",
        "com.opera.browser"            to "com.opera.browser:id/url_field",
        "com.brave.browser"            to "com.brave.browser:id/url_bar",
    )

    private val browserPackages = browserUrlIds.keys

    // ── Lifecycle ────────────────────────────────────────────────────────

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this

        serviceInfo = serviceInfo?.apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                         AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 200
        }
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onInterrupt() { /* required override — nothing to do */ }

    // ── Event handling ───────────────────────────────────────────────────

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        val pkg = event.packageName?.toString() ?: return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> handleWindowChange(pkg)
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                if (pkg in browserPackages) {
                    handleBrowserContent(pkg, event)
                }
            }
        }
    }

    // ── Foreground app detection ─────────────────────────────────────────

    private fun handleWindowChange(packageName: String) {
        // Ignore system UI and self
        if (packageName == "com.android.systemui" ||
            packageName == applicationContext.packageName) return

        if (packageName != lastPackage) {
            lastPackage = packageName

            val label = try {
                val appInfo = packageManager.getApplicationInfo(packageName, 0)
                packageManager.getApplicationLabel(appInfo).toString()
            } catch (_: Exception) { null }

            val params = Arguments.createMap().apply {
                putString("packageName", packageName)
                if (label != null) putString("appLabel", label) else putNull("appLabel")
                putString("timestamp", isoNow())
            }
            emitEvent("WatchdogAppSwitch", params)
        }
    }

    // ── Browser URL scraping ─────────────────────────────────────────────

    private fun handleBrowserContent(packageName: String, event: AccessibilityEvent) {
        val urlViewId = browserUrlIds[packageName] ?: return
        val rootNode = rootInActiveWindow ?: return

        try {
            val nodes = rootNode.findAccessibilityNodeInfosByViewId(urlViewId)
            if (nodes.isNullOrEmpty()) return

            val urlText = nodes[0].text?.toString()
            if (urlText.isNullOrBlank() || urlText == lastUrl) return

            lastUrl = urlText

            val params = Arguments.createMap().apply {
                putString("url", urlText)
                putNull("pageTitle") // not reliably available via accessibility
                putString("contextApp", packageName)
                putString("timestamp", isoNow())
            }
            emitEvent("WatchdogUrlDetected", params)
        } catch (_: Exception) {
            // Node tree may be stale — swallow
        } finally {
            rootNode.recycle()
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private fun emitEvent(eventName: String, params: com.facebook.react.bridge.WritableMap) {
        try {
            val reactContext = (application as? ReactApplication)
                ?.reactHost
                ?.currentReactContext
                ?: return

            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(eventName, params)
        } catch (_: Exception) {
            // React context may not be available yet — silently skip
        }
    }

    private fun isoNow(): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(Date())
    }
}
