package com.littlegarden.app.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import com.littlegarden.app.data.model.CareAction
import com.littlegarden.app.ui.theme.GardenColors as C

@Composable fun CareCard(action: CareAction, completed: Boolean, busy: Boolean, onComplete: () -> Unit) {
    var selected by remember(action) { mutableStateOf(false) }
    val button: @Composable () -> Unit = {
        FilledTonalButton(onClick={if(selected) onComplete() else selected=true},enabled=!completed&&!busy,shape=RoundedCornerShape(14.dp),contentPadding=PaddingValues(10.dp),modifier=Modifier.heightIn(min=48.dp).widthIn(min=64.dp).semantics { contentDescription="${action.title} ${if(completed) "완료했어요" else if(selected) "완료하기" else "해볼게요"}" }) {
            Text(if(completed) "✓ 완료" else if(selected) "완료하기" else "해볼게요",style=MaterialTheme.typography.bodySmall)
        }
    }
    val icon: @Composable () -> Unit = {
        Surface(color=when(action){CareAction.Water->C.Sage;CareAction.Sky->C.Sky;CareAction.Walk->C.Gold},shape=RoundedCornerShape(14.dp)) {
            Box(Modifier.size(40.dp,48.dp),contentAlignment=Alignment.Center) { GardenIcon(when(action){CareAction.Water->"drop";CareAction.Sky->"cloud";CareAction.Walk->"walk"}) }
        }
    }
    val copy: @Composable () -> Unit = {
        Text(action.title,style=MaterialTheme.typography.titleMedium)
        Text(action.description,style=MaterialTheme.typography.bodySmall,color=C.Muted)
        Text(action.duration,style=MaterialTheme.typography.bodySmall,color=C.Muted)
    }
    Surface(color=if(completed) C.Sage.copy(alpha=.6f) else C.Surface,shape=RoundedCornerShape(20.dp),border=BorderStroke(1.dp,if(selected&&!completed) C.Forest else C.Line)) {
        BoxWithConstraints(Modifier.fillMaxWidth().padding(16.dp)) {
            val stacked=maxWidth<270.dp || LocalDensity.current.fontScale>1.2f
            if(stacked) Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) { icon(); Column(Modifier.weight(1f)) { copy() } }
                Box(Modifier.align(Alignment.End)) { button() }
            } else Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                icon(); Column(Modifier.weight(1f)) { copy() }; button()
            }
        }
    }
}
