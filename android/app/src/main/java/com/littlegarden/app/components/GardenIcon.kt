package com.littlegarden.app.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp
import com.littlegarden.app.ui.theme.GardenColors

/** Exact SVG paths from the web prototype, rendered as native vector strokes. */
@Composable fun GardenIcon(name: String, modifier: Modifier=Modifier) {
    val data=when(name) {
        "back" -> "m14 6-6 6 6 6"
        "leaf" -> "M12 21V10M12 15C5 15 4 10 4 7c5 0 8 3 8 8Zm0-3c0-6 4-8 8-8 0 5-3 8-8 8Z"
        "note" -> "M8 3h8a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM9 8h6M9 12h6M9 16h4"
        "drop" -> "M12 3S6 10 6 15a6 6 0 0 0 12 0c0-5-6-12-6-12Z"
        "cloud" -> "M7 18h10a4 4 0 0 0 0-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7Z"
        "walk" -> "M15 4a2 2 0 1 1-4 0 2 2 0 1 1 4 0Zm-5 17 2-6-2-3 2-4 3 3 3 1M7 14l3-2m5 9-3-6"
        else -> "m5 12 4 4L19 6"
    }
    val path=androidx.compose.runtime.remember(data) { PathParser().parsePathString(data).toPath() }
    Canvas(modifier.size(22.dp)) {
        scale(size.width/24f,size.height/24f,pivot=androidx.compose.ui.geometry.Offset.Zero) { drawPath(path,GardenColors.Forest,style=Stroke(1.6f,cap=StrokeCap.Round,join=StrokeJoin.Round)) }
    }
}
