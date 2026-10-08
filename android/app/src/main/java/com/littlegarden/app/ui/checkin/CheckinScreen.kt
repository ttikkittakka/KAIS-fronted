package com.littlegarden.app.ui.checkin

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.littlegarden.app.GardenUiState
import com.littlegarden.app.components.*
import com.littlegarden.app.data.model.GardenContent
import com.littlegarden.app.ui.theme.GardenColors as C

@Composable fun CheckinScreen(state: GardenUiState, back: ()->Unit, choose: (Int)->Unit, next: ()->Unit, note: (String)->Unit, save: (Boolean)->Unit) {
    val keyboard=LocalSoftwareKeyboardController.current
    BackHandler { if(!state.busy) back() }
    ScreenColumn {
        TopBar("나의 일상 기록",back={if(!state.busy) back()})
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(14.dp),verticalAlignment=androidx.compose.ui.Alignment.CenterVertically) {
            LinearProgressIndicator(progress={ (state.step+1).coerceAtMost(4)/4f },modifier=Modifier.weight(1f),color=C.Forest,trackColor=C.Line)
            Text(if(state.step<4) "${state.step+1} / 4" else "마지막 한마디",style=MaterialTheme.typography.bodySmall,color=C.Muted)
        }
        Spacer(Modifier.height(8.dp))
        if(state.step<4) {
            val question=GardenContent.questions[state.step]
            Text(question.title,style=MaterialTheme.typography.headlineMedium)
            Text("지금의 나와 가장 가까운 답을 골라주세요.",style=MaterialTheme.typography.bodyMedium,color=C.Muted)
            Column(Modifier.selectableGroup(),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                question.options.forEachIndexed { i,label -> ChoiceCard(label,state.answers[state.step]==i,!state.busy) { choose(i) } }
            }
            PrimaryButton("다음",!state.busy&&state.answers[state.step]>=0,next)
        } else {
            Text("오늘을 한마디로\n남겨볼까요?",style=MaterialTheme.typography.headlineMedium)
            Text("건너뛰어도 괜찮아요.",color=C.Muted,style=MaterialTheme.typography.bodyMedium)
            OutlinedTextField(state.note,note,modifier=Modifier.fillMaxWidth().heightIn(min=160.dp),enabled=!state.busy,
                label={Text("오늘의 한마디 (선택)")},shape=androidx.compose.foundation.shape.RoundedCornerShape(18.dp),
                supportingText={Text("${state.note.length} / 120")},keyboardOptions=KeyboardOptions(imeAction=ImeAction.Done),keyboardActions=KeyboardActions(onDone={keyboard?.hide()}))
            PrimaryButton(if(state.busy) "저장하고 있어요…" else "오늘의 기록 남기기",!state.busy) { keyboard?.hide(); save(false) }
            TextButton({keyboard?.hide(); save(true)},enabled=!state.busy,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)) { Text("한마디 없이 기록 완료") }
        }
        StatusMessage(state.saveError,true)
        Spacer(Modifier.height(12.dp))
    }
}

