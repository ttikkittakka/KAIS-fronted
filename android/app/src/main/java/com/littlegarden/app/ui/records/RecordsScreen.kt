package com.littlegarden.app.ui.records

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import com.littlegarden.app.GardenUiState
import com.littlegarden.app.components.*
import com.littlegarden.app.ui.theme.GardenColors as C
import java.time.YearMonth

@Composable fun RecordsScreen(state: GardenUiState) {
    var monthText by rememberSaveable { mutableStateOf(YearMonth.from(state.today).toString()) }
    val month=YearMonth.parse(monthText)
    val records=state.data.records.values.filter { YearMonth.from(it.date)==month }.sortedByDescending { it.date }
    ScreenColumn {
        TopBar("나의 정원")
        Text("조금씩 나를 돌봤어요.",style=MaterialTheme.typography.headlineMedium)
        Text("잘한 날만이 아니라, 나를 살펴본 날들이에요.",style=MaterialTheme.typography.bodyMedium,color=C.Muted)
        Surface(color=C.Surface,shape=RoundedCornerShape(24.dp)) {
            Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment=Alignment.CenterVertically) {
                    TextButton({monthText=month.minusMonths(1).toString()},Modifier.size(48.dp)) { Text("‹",modifier=Modifier.semantics { contentDescription="이전 달" }) }
                    Text("${month.year}년 ${month.monthValue}월",Modifier.weight(1f),textAlign=androidx.compose.ui.text.style.TextAlign.Center,style=MaterialTheme.typography.titleLarge)
                    TextButton({monthText=month.plusMonths(1).toString()},Modifier.size(48.dp),enabled=month<YearMonth.from(state.today)) { Text("›",modifier=Modifier.semantics { contentDescription="다음 달" }) }
                }
                Row { listOf("월","화","수","목","금","토","일").forEach { Text(it,Modifier.weight(1f),textAlign=androidx.compose.ui.text.style.TextAlign.Center,style=MaterialTheme.typography.bodySmall,color=C.Muted) } }
                val offset=month.atDay(1).dayOfWeek.value-1
                val count=((offset+month.lengthOfMonth()+6)/7)*7
                (0 until count step 7).forEach { start ->
                    Row(horizontalArrangement=Arrangement.spacedBy(2.dp)) {
                        (start until start+7).forEach { slot ->
                            val day=slot-offset+1
                            val valid=day in 1..month.lengthOfMonth()
                            val recorded=valid && state.data.records.containsKey(month.atDay(day))
                            Box(Modifier.weight(1f).heightIn(min=40.dp).background(if(recorded) C.Sage else C.Surface,RoundedCornerShape(12.dp)).semantics { if(valid) contentDescription="${month.monthValue}월 ${day}일${if(recorded) ", 나를 살핀 날" else ""}" },contentAlignment=Alignment.Center) {
                                if(valid) Text(day.toString(),style=MaterialTheme.typography.bodySmall,modifier=Modifier.clearAndSetSemantics {})
                            }
                        }
                    }
                }
            }
        }
        if(records.isEmpty()) Text("아직 남겨진 기록이 없어요.\n준비가 되면 오늘의 나를 살펴봐요.",color=C.Muted)
        records.forEach { record ->
            Column(Modifier.fillMaxWidth().padding(vertical=8.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                Text("${record.date.monthValue}/${record.date.dayOfMonth} · 나를 살펴봤어요",style=MaterialTheme.typography.titleMedium)
                if(record.completedCare.isNotEmpty()) Text(record.completedCare.sortedBy { it.ordinal }.joinToString(" · ") { it.memory },style=MaterialTheme.typography.bodyMedium,color=C.Muted)
                if(record.note.isNotBlank()) Text(record.note,style=MaterialTheme.typography.bodyMedium)
                HorizontalDivider(color=C.Line)
            }
        }
    }
}
