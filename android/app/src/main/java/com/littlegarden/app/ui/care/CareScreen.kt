package com.littlegarden.app.ui.care

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.unit.dp
import com.littlegarden.app.GardenUiState
import com.littlegarden.app.components.*
import com.littlegarden.app.data.model.*
import com.littlegarden.app.rive.Plant
import com.littlegarden.app.ui.theme.GardenColors as C

@Composable fun CareScreen(state: GardenUiState, back: ()->Unit, home: ()->Unit, complete: (CareAction)->Unit, consumed: (Long)->Unit, review: Boolean=false) {
    val record=state.record ?: return
    ScreenColumn {
        TopBar(if(review) "오늘의 작은 돌봄 다시보기" else "오늘의 작은 돌봄",back)
        Text("오늘의 나를 살펴봤어요.",style=MaterialTheme.typography.bodySmall,color=C.Muted)
        Text(if(record.plantMood==PlantMood.Low) "오늘은 조금 지친 날이네요." else "오늘은 기분이 괜찮은 날이네요.",style=MaterialTheme.typography.headlineMedium)
        Text("아주 작은 것 하나만 해볼까요?",style=MaterialTheme.typography.bodyMedium,color=C.Muted)
        Surface(color=C.Scene,shape=RoundedCornerShape(24.dp)) {
            Box(Modifier.fillMaxWidth().height(194.dp).clipToBounds(),contentAlignment=Alignment.Center) {
                Plant(record.plantMood,state.data.reduceMotion,Modifier.requiredSize(265.dp).offset(y=(-30).dp),state.reaction,state.reactionId,consumed)
            }
        }
        CareAction.entries.forEach { action -> CareCard(action,action in record.completedCare,state.busy) { complete(action) } }
        StatusMessage(state.saveError,true)
        StatusMessage(state.feedback)
        if(record.allCareComplete) {
            Surface(color=C.Sage,shape=RoundedCornerShape(24.dp)) {
                Column(Modifier.padding(24.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                    Text("오늘의 나를 위해\n세 가지를 해냈어요.",style=MaterialTheme.typography.headlineMedium)
                    Text("나를 돌본 시간이 정원에 남았어요.",style=MaterialTheme.typography.bodyMedium,color=C.Muted)
                }
            }
        }
        TextButton(home,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)) { Text("오늘의 정원으로") }
    }
}

