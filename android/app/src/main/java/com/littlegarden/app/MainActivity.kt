package com.littlegarden.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.littlegarden.app.navigation.GardenApp
import com.littlegarden.app.ui.theme.GardenTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Only a configuration recreation retains ComponentActivity's non-config instance.
        // A new Activity/process starts a new UI journey, while DataStore records remain intact.
        val restoreUi = com.littlegarden.app.navigation.GardenFlow.restoreTransientUi(
            savedInstanceState != null, lastNonConfigurationInstance != null)
        super.onCreate(if (restoreUi) savedInstanceState else null)
        enableEdgeToEdge()
        val repository=(application as GardenApplication).repository
        setContent {
            val vm: GardenViewModel=viewModel(factory=viewModelFactory {
                initializer { GardenViewModel(repository,createSavedStateHandle()) }
            })
            GardenTheme { GardenApp(vm) }
        }
    }
}

