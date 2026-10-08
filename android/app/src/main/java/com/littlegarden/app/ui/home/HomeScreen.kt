package com.littlegarden.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.littlegarden.app.GardenUiState
import com.littlegarden.app.components.*
import com.littlegarden.app.data.model.PlantMood
import com.littlegarden.app.rive.Plant
import com.littlegarden.app.ui.theme.GardenColors as C

@Composable fun HomeScreen(state: GardenUiState, checkin: ()->Unit, openCare: ()->Unit, motion: (Boolean)->Unit) {
    ScreenColumn {
        TopBar("오늘의 정원")
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart=140.dp,topEnd=140.dp,bottomStart=28.dp,bottomEnd=28.dp)).background(C.Scene),contentAlignment=Alignment.Center) {
            Canvas(Modifier.matchParentSize()) {
                drawOval(androidx.compose.ui.graphics.Color(0xFFD8DFCB),topLeft=androidx.compose.ui.geometry.Offset(-size.width*.1f,size.height-55.dp.toPx()),size=androidx.compose.ui.geometry.Size(size.width*1.2f,85.dp.toPx()))
            }
            Text(state.today.format(java.time.format.DateTimeFormatter.ofPattern("M월 d일 EEEE",java.util.Locale.KOREAN)),style=MaterialTheme.typography.bodySmall,color=C.Muted,modifier=Modifier.align(Alignment.TopStart).padding(22.dp,24.dp))
            Plant(state.record?.plantMood ?: PlantMood.Normal,state.data.reduceMotion,Modifier.fillMaxWidth(),waitForFirstFrame=true)
        }
        Column(Modifier.fillMaxWidth(),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(8.dp)) {
            Text("오늘의 모습",style=MaterialTheme.typography.bodySmall,color=C.Muted)
            Text(if(state.record==null) "오늘의 나를 가볍게 살펴볼까요?" else if(state.record?.plantMood==PlantMood.Low) "조금 지쳐 보여요." else "오늘은 기분이 괜찮은 날이네요.",style=MaterialTheme.typography.headlineMedium,textAlign=TextAlign.Center)
            Text(if(state.data.returningAfterBreak(state.today)) "오랜만이에요.\n다시 만나서 반가워요." else if(state.record?.plantMood==PlantMood.Low) "오늘은 천천히 가도 괜찮아요." else "잠깐, 나에게 안부를 물어봐요.",style=MaterialTheme.typography.bodyMedium,color=C.Muted,textAlign=TextAlign.Center)
        }
        PrimaryButton(com.littlegarden.app.navigation.GardenFlow.homeLabel(state.record),
            enabled=!state.busy,onClick=if(state.record==null) checkin else openCare)
        if(state.record!=null) TextButton(checkin,enabled=!state.busy,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)) { Text("나의 일상 기록 확인하기") }
        Surface(color=C.Sage.copy(alpha=.45f),shape=RoundedCornerShape(18.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(if(state.record==null) "작은 시작도 충분해요." else "오늘도 나를 한 번 살펴봤어요.",style=MaterialTheme.typography.bodyMedium)
                Text(if(state.record==null) "좋은 날도, 지친 날도 있는 그대로요." else "이 시간은 정원에 조용히 남아요.",style=MaterialTheme.typography.bodySmall,color=C.Muted)
            }
        }
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
            Text("편안하게 모션 줄이기",Modifier.weight(1f),style=MaterialTheme.typography.bodySmall,color=C.Muted)
            Switch(state.data.reduceMotion,motion,enabled=!state.busy)
        }
        StatusMessage(state.feedback)
        StatusMessage(state.saveError,true)
    }
}



