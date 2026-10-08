package com.littlegarden.app.navigation

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.*
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.compose.*
import com.littlegarden.app.GardenViewModel
import com.littlegarden.app.components.*
import com.littlegarden.app.ui.onboarding.OnboardingScreen
import com.littlegarden.app.ui.home.HomeScreen
import com.littlegarden.app.ui.checkin.CheckinScreen
import com.littlegarden.app.ui.care.CareScreen
import com.littlegarden.app.ui.records.RecordsScreen
import kotlinx.coroutines.delay

@Composable fun GardenApp(vm: GardenViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while(true) { vm.refreshDay(); delay(1_000) }
        }
    }
    if(!state.loaded) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.safeDrawingPadding().padding(24.dp),verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.CenterHorizontally) {
                if(state.readError==null) { CircularProgressIndicator(); Text("정원을 준비하고 있어요.") }
                else { StatusMessage(state.readError,true); PrimaryButton("다시 불러오기",onClick=vm::retryRead) }
            }
        }
        return
    }
    val nav=rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route=entry?.destination?.route
    // Persisted records and plant mood must never choose the launch destination.
    fun home() { nav.navigate("home") { popUpTo("home") { inclusive=true }; launchSingleTop=true } }
    val reduced=state.data.reduceMotion || !android.animation.ValueAnimator.areAnimatorsEnabled()
    Scaffold(contentWindowInsets=WindowInsets.safeDrawing,bottomBar={
        if(route=="home"||route=="records") BottomNavigation(route.orEmpty()) { target ->
            if(target=="home") home() else nav.navigate(target) { popUpTo("home"); launchSingleTop=true }
        }
    }) { insets ->
        Box(Modifier.fillMaxSize().padding(insets).consumeWindowInsets(insets).imePadding(),contentAlignment=Alignment.TopCenter) {
            NavHost(nav,startDestination=GardenFlow.START,modifier=Modifier.widthIn(max=600.dp).fillMaxSize(),
                enterTransition={fadeIn(tween(if(reduced) 0 else 220))},exitTransition={fadeOut(tween(if(reduced) 0 else 160))}) {
                composable("onboarding") { OnboardingScreen(state.busy,state.data.reduceMotion,state.saveError) {
                    nav.navigate(GardenFlow.HOME) { popUpTo(GardenFlow.START) { inclusive=true }; launchSingleTop=true }
                } }
                composable("home") {
                    HomeScreen(state,checkin={vm.beginCheckin(); nav.navigate(GardenFlow.CHECKIN) { launchSingleTop=true }},
                        openCare={
                            vm.refreshDay()
                            nav.navigate(GardenFlow.homeAction(vm.state.value.record)) { launchSingleTop=true }
                        },motion=vm::setReduceMotion)
                }
                composable("records") { RecordsScreen(state) }
                composable("checkin") {
                    LaunchedEffect(Unit) { vm.beginCheckin() }
                    CheckinScreen(state,back={if(!vm.previous()) nav.popBackStack()},choose=vm::choose,next=vm::next,note=vm::note,
                        save={skip -> vm.saveCheckin(skip) { nav.navigate("care") { launchSingleTop=true } }})
                }
                listOf(GardenFlow.CARE,GardenFlow.CARE_HISTORY).forEach { careRoute ->
                    composable(careRoute) {
                        val allowed=GardenFlow.allowedDestination(careRoute,state.record)
                        if(allowed!=careRoute) {
                            LaunchedEffect(allowed,state.today) {
                                if(allowed==GardenFlow.CHECKIN) vm.beginCheckin()
                                nav.navigate(allowed) { popUpTo(GardenFlow.HOME) { inclusive=false }; launchSingleTop=true }
                            }
                        } else CareScreen(state,back={nav.popBackStack()},home={home()},complete=vm::complete,
                            consumed={id ->
                                val current=vm.state.value
                                val completed=current.reactionId==id && current.reaction==com.littlegarden.app.data.model.PlantReaction.Complete && current.record?.allCareComplete==true
                                vm.reactionConsumed(id)
                                if(completed) home()
                            },review=careRoute==GardenFlow.CARE_HISTORY)
                    }
                }
            }
        }
    }
}


