# ProGuard rules for MedControl (React Native / Expo)
# These rules prevent R8 from breaking the app at runtime

# ============================================
# REACT NATIVE CORE
# ============================================
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Keep native methods
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
    @com.facebook.react.uimanager.annotations.ReactProp *;
    @com.facebook.react.uimanager.annotations.ReactPropGroup *;
}

# Keep ReactPackage implementations
-keep class * implements com.facebook.react.ReactPackage { *; }

# Keep TurboModules
-keep class com.facebook.react.turbomodule.** { *; }
-keepclassmembers class * extends com.facebook.react.turbomodule.core.interfaces.TurboModule {
    *;
}

# Hermes engine
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# ============================================
# REACT NATIVE REANIMATED
# ============================================
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }

# ============================================
# EXPO MODULES
# ============================================
-keep class expo.modules.** { *; }
-keep class com.expo.** { *; }

# Expo Notifications
-keep class expo.modules.notifications.** { *; }

# Expo Image Picker
-keep class expo.modules.imagepicker.** { *; }

# Expo Task Manager / Background Fetch
-keep class expo.modules.taskManager.** { *; }
-keep class expo.modules.backgroundfetch.** { *; }

# ============================================
# REACT NAVIGATION
# ============================================
-keep class com.swmansion.rnscreens.** { *; }

# ============================================
# ASYNC STORAGE
# ============================================
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ============================================
# WEBVIEW
# ============================================
-keep class com.reactnativecommunity.webview.** { *; }

# ============================================
# DATE TIME PICKER
# ============================================
-keep class com.reactcommunity.rndatetimepicker.** { *; }

# ============================================
# OKHTTP / NETWORKING
# ============================================
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }

# ============================================
# FLOGGER (used by React Native)
# ============================================
-dontwarn com.google.common.flogger.**

# ============================================
# GENERAL ANDROID
# ============================================
# Keep Parcelable implementations
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# Keep Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Keep annotations
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
-keepattributes SourceFile,LineNumberTable

# ============================================
# SUPPRESS WARNINGS
# ============================================
-dontwarn javax.annotation.**
-dontwarn sun.misc.Unsafe
-dontwarn java.lang.invoke.**
