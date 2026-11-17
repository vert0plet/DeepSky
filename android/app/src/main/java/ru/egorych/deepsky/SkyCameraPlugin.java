package ru.egorych.deepsky;

import android.Manifest;
import android.content.Intent;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONException;

@CapacitorPlugin(name = "SkyCamera", permissions = @Permission(alias = "camera", strings = Manifest.permission.CAMERA))
public class SkyCameraPlugin extends Plugin {
    @PluginMethod public void open(PluginCall call) {
        try {
            SkyCameraRequest.parse(call.getData());
        } catch (JSONException | IllegalArgumentException e) {
            call.reject("Не удалось подготовить координаты цели.");
            return;
        }
        if (getPermissionState("camera") == PermissionState.GRANTED) openWithPermission(call);
        else requestPermissionForAlias("camera", call, "openWithPermission");
    }

    @PermissionCallback private void openWithPermission(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Для наведения разреши DeepSky доступ к камере в настройках Android.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            var intent = new Intent(getContext(), SkyCameraActivity.class);
            intent.putExtra(SkyCameraActivity.EXTRA_REQUEST, call.getData().toString());
            getActivity().startActivity(intent);
            call.resolve();
        });
    }
}
