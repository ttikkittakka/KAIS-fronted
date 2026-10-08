package com.littlegarden.app.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object GardenColors {
    val Paper=Color(0xFFF7F5EE); val Surface=Color(0xFFFFFDF8); val Forest=Color(0xFF3F5D46)
    val Ink=Color(0xFF293D32); val Muted=Color(0xFF626E63); val Sage=Color(0xFFDFE8DC)
    val Line=Color(0xFFD5DACE); val ControlBorder=Color(0xFFB5C1AE); val Scene=Color(0xFFE8EDDF)
    val Sky=Color(0xFFE6EDF0); val Gold=Color(0xFFF1DFAC)
}
private val type=Typography(
    headlineLarge=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.SemiBold,fontSize=28.sp,lineHeight=40.sp),
    headlineMedium=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.SemiBold,fontSize=26.sp,lineHeight=36.sp),
    titleLarge=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.SemiBold,fontSize=17.sp,lineHeight=26.sp),
    titleMedium=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.Medium,fontSize=16.sp,lineHeight=26.sp),
    bodyLarge=TextStyle(fontFamily=FontFamily.SansSerif,fontSize=16.sp,lineHeight=26.sp),
    bodyMedium=TextStyle(fontFamily=FontFamily.SansSerif,fontSize=14.sp,lineHeight=22.sp),
    bodySmall=TextStyle(fontFamily=FontFamily.SansSerif,fontSize=13.sp,lineHeight=20.sp),
    labelLarge=TextStyle(fontFamily=FontFamily.SansSerif,fontWeight=FontWeight.SemiBold,fontSize=16.sp,lineHeight=24.sp)
)
@Composable fun GardenTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme=lightColorScheme(primary=GardenColors.Forest,onPrimary=Color.White,background=GardenColors.Paper,onBackground=GardenColors.Ink,surface=GardenColors.Surface,onSurface=GardenColors.Ink,onSurfaceVariant=GardenColors.Muted,secondaryContainer=GardenColors.Sage,onSecondaryContainer=GardenColors.Forest,outline=GardenColors.ControlBorder),typography=type,content=content)
}
