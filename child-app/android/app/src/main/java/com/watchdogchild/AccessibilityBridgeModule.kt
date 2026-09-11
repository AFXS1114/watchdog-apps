package com.watchdogchild

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.text.TextUtils

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * React Native bridge for the WatchdogAccessibilityService.
 *
 * Exposes two methods to JS:
 *   - isAccessibilityEnabled()  → checks if our service is in the enabled list
 *   - openAccessibilitySettings() → opens the system Accessibility page
 */
class AccessibilityBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WatchdogAccessibility"

    @ReactMethod
    fun isAccessibilityEnabled(promise: Promise) {
        try {
            val enabled = isServiceEnabled(reactApplicationContext)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("ACCESSIBILITY_CHECK_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.message, e)
        }
    }

    /**
     * Checks the system Settings string that contains the flat list of
     * enabled accessibility services (e.g. "com.watchdogchild/.WatchdogAccessibilityService")
     */
    private fun isServiceEnabled(context: Context): Boolean {
        val expectedComponent =
            "${context.packageName}/${WatchdogAccessibilityService::class.java.canonicalName}"

        val enabledServices: String = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false

        val colonSplitter = TextUtils.SimpleStringSplitter(':')
        colonSplitter.setString(enabledServices)

        while (colonSplitter.hasNext()) {
            val componentName = colonSplitter.next()
            if (componentName.equals(expectedComponent, ignoreCase = true)) {
                return true
            }
        }
        return false
    }
}
