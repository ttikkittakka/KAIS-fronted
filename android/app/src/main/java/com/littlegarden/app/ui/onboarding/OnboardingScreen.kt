package com.littlegarden.app.ui.onboarding

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.littlegarden.app.components.*
import com.littlegarden.app.data.model.PlantMood
import com.littlegarden.app.rive.Plant
import com.littlegarden.app.ui.theme.GardenColors as C

@Composable fun OnboardingScreen(busy: Boolean, reduceMotion: Boolean, error: String?, start: ()->Unit) {
    ScreenColumn(Modifier.background(androidx.compose.ui.graphics.Brush.verticalGradient(0f to C.Scene,.65f to C.Paper,1f to C.Paper))) {
        Spacer(Modifier.height(96.dp))
        Plant(PlantMood.Normal,reduceMotion,Modifier.size(156.dp).align(androidx.compose.ui.Alignment.CenterHorizontally))
        Text("오늘의 나를\n만나러 가볼까요?",style=MaterialTheme.typography.headlineLarge,textAlign=TextAlign.Center,modifier=Modifier.fillMaxWidth())
        Text("작은 정원에서\n천천히 나를 돌봐요.",color=C.Muted,textAlign=TextAlign.Center,modifier=Modifier.fillMaxWidth())
        Spacer(Modifier.height(16.dp))
        StatusMessage(error,true)
        PrimaryButton(if(busy) "준비하고 있어요…" else "시작하기",!busy,start)
        Text("천천히 시작해도 괜찮아요.",style=MaterialTheme.typography.bodySmall,color=C.Muted,textAlign=TextAlign.Center,modifier=Modifier.fillMaxWidth())
    }
}

