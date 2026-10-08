@file:Suppress("DEPRECATION")
package com.littlegarden.app.rive

import android.animation.ValueAnimator
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import app.rive.runtime.kotlin.RiveAnimationView
import app.rive.runtime.kotlin.core.Fit
import app.rive.runtime.kotlin.core.Loop
import com.littlegarden.app.R
import com.littlegarden.app.data.model.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.awaitCancellation

/** Native Rive View: original timelines have no inputs; no WebView or altered artwork. */
@Composable fun Plant(mood: PlantMood, reduceMotion: Boolean, modifier: Modifier=Modifier,
    reaction: PlantReaction?=null, reactionId: Long=0, consumed: (Long)->Unit={}, waitForFirstFrame: Boolean=false) {
    var view by remember { mutableStateOf<RiveAnimationView?>(null) }
    var failed by remember { mutableStateOf(false) }
    var touch by remember { mutableIntStateOf(0) }; var handledTouch by remember { mutableIntStateOf(0) }
    val owner=LocalLifecycleOwner.current
    val onConsumed by rememberUpdatedState(consumed)
    val still=reduceMotion || !ValueAnimator.areAnimatorsEnabled()
    val base=if(mood==PlantMood.Low) "low_energy" else "idle"
    val label=if(mood==PlantMood.Low) "오늘의 나를 비추는 조금 지친 식물" else "오늘의 나를 비추는 편안한 식물"
    Box(modifier.aspectRatio(1f).semantics(mergeDescendants=true) { contentDescription=label }
        .clickable(enabled=!still&&!failed,onClickLabel="식물과 인사하기") { touch++ }) {
        if(still || failed) Image(painterResource(if(mood==PlantMood.Low) R.drawable.plant_low else R.drawable.plant_normal),null,Modifier.fillMaxSize())
        else AndroidView(factory={ context -> (if(waitForFirstFrame) FirstFrameRiveAnimationView(context) else RiveAnimationView(context)).also { native ->
            try { native.setRiveResource(R.raw.plant_original,artboardName="Artboard 1",animationName=base,autoplay=false,fit=Fit.CONTAIN) }
            catch(e: Exception) { failed=true }
            view=native
        } },modifier=Modifier.fillMaxSize(),onRelease={it.pause(); view=null})
    }
    LaunchedEffect(view,base,reactionId,reaction,touch,still,failed,owner) {
        if(still||failed) { if(reaction!=null) onConsumed(reactionId); return@LaunchedEffect }
        val native=view ?: return@LaunchedEffect
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            try {
                native.stop()
                val event=reaction ?: if(touch>handledTouch) PlantReaction.Touch else null
                handledTouch=touch
                if(event!=null) {
                    native.play(event.animation,loop=Loop.ONESHOT)
                    delay(event.durationMs)
                    if(reaction!=null) onConsumed(reactionId)
                }
                native.stop(); native.play(base,loop=Loop.LOOP)
                awaitCancellation()
            } catch(e: kotlinx.coroutines.CancellationException) { throw e }
            catch(e: Exception) { failed=true }
            finally { native.pause() }
        }
    }
}

