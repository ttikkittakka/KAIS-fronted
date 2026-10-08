@file:Suppress("DEPRECATION")
package com.littlegarden.app.rive

import android.content.Context
import android.graphics.Paint
import android.graphics.SurfaceTexture
import app.rive.runtime.kotlin.RiveAnimationView

/** Home-only first-buffer gate. Keep TextureView drawing so its producer can start. */
internal class FirstFrameRiveAnimationView(context: Context) : RiveAnimationView(context) {
    private val hiddenLayer = Paint().apply { alpha = 0 }
    internal var firstFramePresented = false
        private set

    init {
        isOpaque = false
        setLayerPaint(hiddenLayer)
    }

    private fun hideUninitializedSurface() {
        firstFramePresented = false
        // TextureView alpha/visibility can skip draw() and prevent surface initialization.
        // Layer paint hides only compositing; texture acquisition and callbacks still run.
        setLayerPaint(hiddenLayer)
    }

    override fun onAttachedToWindow() {
        hideUninitializedSurface()
        super.onAttachedToWindow()
    }

    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
        hideUninitializedSurface()
        super.onSurfaceTextureAvailable(surface, width, height)
    }

    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {
        super.onSurfaceTextureUpdated(surface)
        // Availability/loading is not enough. A nonzero timestamp identifies an acquired
        // producer buffer; an artboard must also exist before the texture is presented.
        if (!firstFramePresented && surface.timestamp > 0L && controller.activeArtboard != null) {
            firstFramePresented = true
            setLayerPaint(null)
        }
    }

    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        hideUninitializedSurface()
        return super.onSurfaceTextureDestroyed(surface)
    }

    override fun onDetachedFromWindow() {
        hideUninitializedSurface()
        super.onDetachedFromWindow()
    }
}
