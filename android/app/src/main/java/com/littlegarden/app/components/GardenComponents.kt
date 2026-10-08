package com.littlegarden.app.components

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import com.littlegarden.app.ui.theme.GardenColors as C

@Composable fun PrimaryButton(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(onClick, Modifier.fillMaxWidth().heightIn(min=56.dp), enabled=enabled,
        shape=RoundedCornerShape(18.dp), contentPadding=PaddingValues(18.dp,14.dp)) { Text(label) }
}
@Composable fun TopBar(title: String, back: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().heightIn(min=56.dp), verticalAlignment=Alignment.CenterVertically) {
        if(back!=null) IconButton(back,Modifier.size(48.dp).semantics { contentDescription="뒤로" }) { GardenIcon("back") }
        else Spacer(Modifier.width(48.dp))
        Text(title, Modifier.weight(1f), textAlign=androidx.compose.ui.text.style.TextAlign.Center, style=MaterialTheme.typography.titleLarge)
        Spacer(Modifier.width(48.dp))
    }
}
@Composable fun ScreenColumn(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal=24.dp,vertical=16.dp), verticalArrangement=Arrangement.spacedBy(16.dp), content=content)
}
@Composable fun ChoiceCard(label: String, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Surface(color=if(selected) C.Sage else C.Surface, shape=RoundedCornerShape(18.dp),
        border=BorderStroke(if(selected) 2.dp else 1.dp,if(selected) C.Forest else C.ControlBorder)) {
        Row(Modifier.fillMaxWidth().heightIn(min=60.dp).selectable(selected, enabled=enabled, role=Role.RadioButton,onClick=onClick).padding(18.dp,16.dp),verticalAlignment=Alignment.CenterVertically) {
            Text(label, Modifier.weight(1f))
            Text(if(selected) "✓" else "○", color=C.Forest, modifier=Modifier.padding(start=12.dp).clearAndSetSemantics {})
        }
    }
}
@Composable fun BottomNavigation(route: String, navigate: (String) -> Unit) {
    Surface(color=C.Surface) {
        Column { HorizontalDivider(color=C.Line)
            Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(24.dp,8.dp),horizontalArrangement=Arrangement.spacedBy(16.dp)) {
                listOf("home" to "정원", "records" to "기록").forEach { (target,label) ->
                    Surface(color=if(route==target) C.Sage else C.Surface,shape=RoundedCornerShape(16.dp),modifier=Modifier.weight(1f)) {
                        Box(Modifier.heightIn(min=48.dp).selectable(route==target,role=Role.Tab,onClick={navigate(target)}).padding(12.dp),contentAlignment=Alignment.Center) {
                            Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) { GardenIcon(if(target=="home") "leaf" else "note"); Text(label,color=if(route==target) C.Forest else C.Muted,style=MaterialTheme.typography.titleMedium) }
                        }
                    }
                }
            }
        }
    }
}
@Composable fun StatusMessage(message: String?, error: Boolean=false) {
    if(!message.isNullOrBlank()) Text(message,style=MaterialTheme.typography.bodyMedium,color=if(error) MaterialTheme.colorScheme.error else C.Forest,modifier=Modifier.semantics { liveRegion=LiveRegionMode.Polite })
}
