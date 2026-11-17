package ru.egorych.deepsky;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "WeatherAlerts",
    permissions = @Permission(alias = "notifications", strings = Manifest.permission.POST_NOTIFICATIONS))
public class WeatherAlertsPlugin extends Plugin {
    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", WeatherAlerts.site(getContext()) != null);
        result.put("allowed", WeatherAlerts.allowed(getContext()));
        call.resolve(result);
    }

    @PluginMethod public void enable(PluginCall call) {
        if (site(call) == null) {
            call.reject("Invalid forecast location");
        } else if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermission");
        } else {
            notificationPermission(call);
        }
    }

    @PermissionCallback private void notificationPermission(PluginCall call) {
        if (WeatherAlerts.allowed(getContext())) WeatherAlerts.configure(getContext(), site(call), true);
        status(call);
    }

    @PluginMethod public void syncSite(PluginCall call) {
        WeatherAlerts.configure(getContext(), site(call), false);
        status(call);
    }

    @PluginMethod public void disable(PluginCall call) {
        WeatherAlerts.disable(getContext());
        status(call);
    }

    private static WeatherForecast.Site site(PluginCall call) {
        return WeatherForecast.Site.create(call.getDouble("latitude"), call.getDouble("longitude"), call.getInt("offsetSeconds"));
    }
}
