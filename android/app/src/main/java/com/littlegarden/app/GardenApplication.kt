package com.littlegarden.app

import android.app.Application
import com.littlegarden.app.data.repository.LocalGardenRepository

open class GardenApplication : Application() {
    open val repository: com.littlegarden.app.data.repository.GardenRepository by lazy { LocalGardenRepository(this) }
}

