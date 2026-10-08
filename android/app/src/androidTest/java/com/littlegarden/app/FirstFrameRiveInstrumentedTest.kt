@file:Suppress("DEPRECATION")
package com.littlegarden.app

import android.graphics.Color
import androidx.compose.runtime.*
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.test.junit4.createComposeRule
import app.rive.runtime.kotlin.core.Fit
import com.littlegarden.app.rive.FirstFrameRiveAnimationView
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Uses the real native runtime even when the device disables UI animations. */
class FirstFrameRiveInstrumentedTest {
    @get:Rule val ui=createComposeRule()

    @Test fun eachNewSurfaceWaitsForARealFrameAndPreservesTransparentAsset() {
        var generation by mutableIntStateOf(0)
        lateinit var native:FirstFrameRiveAnimationView
        ui.setContent {
            key(generation) {
                AndroidView(factory={ context -> FirstFrameRiveAnimationView(context).also { native=it } },
                    modifier=Modifier.size(200.dp),onRelease={it.pause()})
            }
        }
        repeat(5) { iteration ->
            if(iteration>0) ui.runOnIdle { generation++ }
            ui.waitForIdle()
            // No file yet: initialization can take arbitrarily long without revealing a layer.
            ui.runOnIdle {
                assertFalse(native.firstFramePresented)
                assertFalse(native.isOpaque)
                native.setRiveResource(R.raw.plant_original,artboardName="Artboard 1",
                    animationName=if(iteration%2==0) "idle" else "low_energy",autoplay=true,fit=Fit.CONTAIN)
            }
            // This is a test failure timeout, not a production visibility delay.
            ui.waitUntil(timeoutMillis=15_000) { ui.runOnIdle { native.firstFramePresented } }
            ui.runOnIdle {
                val frame=requireNotNull(native.getBitmap(32,32))
                try {
                    // The original artboard must leave the Compose garden visible at its corners.
                    listOf(0 to 0,31 to 0,0 to 31,31 to 31).forEach { (x,y) ->
                        assertEquals("Opaque Rive background at ($x,$y)",0,Color.alpha(frame.getPixel(x,y)))
                    }
                } finally { frame.recycle() }
            }
        }
    }
}
