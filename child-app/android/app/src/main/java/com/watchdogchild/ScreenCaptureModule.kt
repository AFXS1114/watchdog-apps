package com.watchdogchild

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.util.DisplayMetrics

import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer

class ScreenCaptureModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        private const val REQUEST_CODE_CAPTURE_PERM = 1001
    }

    private var projectionManager: MediaProjectionManager? = null
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null

    private var pendingPermissionPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
        projectionManager = reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    }

    override fun getName(): String = "WatchdogScreenCapture"

    // ── MediaProjection Permission Request ────────────────────────────────

    @ReactMethod
    fun requestProjectionPermission(promise: Promise) {
        val currentActivity = currentActivity
        if (currentActivity == null) {
            promise.reject("E_ACTIVITY_DOES_NOT_EXIST", "Activity doesn't exist")
            return
        }

        // On Android 14+, we MUST have a foreground service of type mediaProjection running
        // BEFORE showing the MediaProjection consent dialog.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val serviceIntent = Intent(reactApplicationContext, ScreenCaptureForegroundService::class.java)
            reactApplicationContext.startForegroundService(serviceIntent)
        }

        pendingPermissionPromise = promise
        try {
            val intent = projectionManager?.createScreenCaptureIntent()
            if (intent != null) {
                currentActivity.startActivityForResult(intent, REQUEST_CODE_CAPTURE_PERM)
            } else {
                promise.reject("E_INTENT_CREATION_FAILED", "Failed to create capture intent")
                pendingPermissionPromise = null
            }
        } catch (e: Exception) {
            promise.reject("E_INTENT_EXCEPTION", e.message, e)
            pendingPermissionPromise = null
        }
    }

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_CODE_CAPTURE_PERM) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                try {
                    mediaProjection = projectionManager?.getMediaProjection(resultCode, data)
                    pendingPermissionPromise?.resolve(mediaProjection != null)
                } catch (e: Exception) {
                    pendingPermissionPromise?.reject("E_PROJECTION_FAILED", "Failed to get MediaProjection", e)
                }
            } else {
                // User denied or cancelled
                // Stop the foreground service since we didn't get projection
                val serviceIntent = Intent(reactApplicationContext, ScreenCaptureForegroundService::class.java)
                reactApplicationContext.stopService(serviceIntent)

                pendingPermissionPromise?.resolve(false)
            }
            pendingPermissionPromise = null
        }
    }

    override fun onNewIntent(intent: Intent?) {
        // Not used
    }

    // ── Screen Capture ───────────────────────────────────────────────────

    @ReactMethod
    fun captureScreen(options: ReadableMap?, promise: Promise) {
        if (mediaProjection == null) {
            promise.reject("E_NO_PERMISSION", "MediaProjection not acquired. Call requestProjectionPermission first.")
            return
        }

        val quality = if (options != null && options.hasKey("quality")) options.getInt("quality") else 60
        val maxWidth = if (options != null && options.hasKey("maxWidth")) options.getInt("maxWidth") else 720

        try {
            val metrics = reactApplicationContext.resources.displayMetrics
            val screenWidth = metrics.widthPixels
            val screenHeight = metrics.heightPixels
            val density = metrics.densityDpi

            // We need a fresh ImageReader each time to avoid "buffer queue full" issues,
            // or we must manage the ImageReader lifecycle strictly. Creating per capture
            // is safer for occasional screenshots.
            imageReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2)

            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "WatchdogScreenCapture",
                screenWidth,
                screenHeight,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader?.surface,
                null,
                null
            )

            // Wait a tiny bit for the surface to receive the first frame
            // Using a simple Thread.sleep in a ReactMethod (which runs on a background thread) is okay,
            // but a handler is better. For simplicity and robustness of one-shot capture:
            Thread.sleep(300)

            val image: Image? = imageReader?.acquireLatestImage()
            if (image == null) {
                cleanupCapture()
                promise.reject("E_CAPTURE_FAILED", "Failed to acquire image from ImageReader")
                return
            }

            val planes = image.planes
            val buffer: ByteBuffer = planes[0].buffer
            val pixelStride: Int = planes[0].pixelStride
            val rowStride: Int = planes[0].rowStride
            val rowPadding: Int = rowStride - pixelStride * screenWidth

            // Create bitmap from buffer
            var bitmap = Bitmap.createBitmap(
                screenWidth + rowPadding / pixelStride,
                screenHeight,
                Bitmap.Config.ARGB_8888
            )
            bitmap.copyPixelsFromBuffer(buffer)

            // Crop to actual screen width
            if (rowPadding > 0) {
                bitmap = Bitmap.createBitmap(bitmap, 0, 0, screenWidth, screenHeight)
            }

            image.close()
            cleanupCapture()

            // Downscale if needed
            if (maxWidth > 0 && screenWidth > maxWidth) {
                val scale = maxWidth.toFloat() / screenWidth
                val destHeight = (screenHeight * scale).toInt()
                bitmap = Bitmap.createScaledBitmap(bitmap, maxWidth, destHeight, true)
            }

            // Save to cache
            val outputDir = reactApplicationContext.cacheDir
            val outputFile = File(outputDir, "capture_${System.currentTimeMillis()}.jpg")
            val fos = FileOutputStream(outputFile)
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, fos)
            fos.close()
            bitmap.recycle()

            val result = Arguments.createMap().apply {
                putString("path", outputFile.absolutePath)
                putInt("width", bitmap.width)
                putInt("height", bitmap.height)
                putInt("fileSizeBytes", outputFile.length().toInt())
            }

            promise.resolve(result)

        } catch (e: Exception) {
            cleanupCapture()
            promise.reject("E_CAPTURE_EXCEPTION", e.message, e)
        }
    }

    @ReactMethod
    fun releaseProjection(promise: Promise) {
        cleanupCapture()
        mediaProjection?.stop()
        mediaProjection = null

        val serviceIntent = Intent(reactApplicationContext, ScreenCaptureForegroundService::class.java)
        reactApplicationContext.stopService(serviceIntent)

        promise.resolve(null)
    }

    private fun cleanupCapture() {
        virtualDisplay?.release()
        virtualDisplay = null
        imageReader?.close()
        imageReader = null
    }
}
