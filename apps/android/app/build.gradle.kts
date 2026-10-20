// Trusted Web Activity wrapper: the Android app opens the Civil Suits web app full-screen.
// All logic, auth and data stay on the web app; this module only ships a launcher.
plugins {
    id("com.android.application")
}

android {
    namespace = "com.promenix.civilsuits"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.promenix.civilsuits"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
