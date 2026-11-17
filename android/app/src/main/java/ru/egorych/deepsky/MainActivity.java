package ru.egorych.deepsky;

import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SkyOrientationPlugin.class);
        registerPlugin(SkyCameraPlugin.class);
        registerPlugin(WeatherAlertsPlugin.class);
        // The launcher and weather notification use no extras. Capacitor would
        // otherwise pass external launch extras into Cordova preferences.
        getIntent().replaceExtras((Bundle) null);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(Color.rgb(10, 16, 22));
        // Capacitor SystemBars owns IME/safe-area insets. Applying them here too
        // shrinks the WebView twice when the keyboard opens.
        ViewCompat.requestApplyInsets(content);
        enterFullscreen();
    }
    private void enterFullscreen() {
        View content = findViewById(android.R.id.content);
        if (content == null) return;
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), content);
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterFullscreen();
    }
}
