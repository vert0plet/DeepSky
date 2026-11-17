package ru.egorych.deepsky;

import android.content.Context;
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.view.Surface;
import android.view.WindowManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SkyOrientation")
public class SkyOrientationPlugin extends Plugin implements SensorEventListener {
    private SensorManager manager;
    private Sensor sensor;
    private boolean running;
    private boolean mapAwake;
    private long lastEvent;
    private int accuracy = SensorManager.SENSOR_STATUS_UNRELIABLE;
    private float declination;
    private final float[] matrix = new float[9];

    @Override public void load() {
        manager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        sensor = manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (sensor == null) sensor = manager.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
    }
    @PluginMethod public void available(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", sensor != null);
        result.put("gyroscope", manager.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null);
        result.put("magnetometer", manager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null);
        call.resolve(result);
    }
    @PluginMethod public void start(PluginCall call) {
        if (sensor == null) { call.reject("На устройстве нет подходящего датчика направления."); return; }
        Double lat = call.getDouble("latitude", 56.0), lon = call.getDouble("longitude", 37.6);
        if (!Double.isFinite(lat) || !Double.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { call.reject("Некорректные координаты."); return; }
        declination = new GeomagneticField(lat.floatValue(), lon.floatValue(), 0, System.currentTimeMillis()).getDeclination();
        getActivity().runOnUiThread(() -> {
            stopSensor(); accuracy = SensorManager.SENSOR_STATUS_UNRELIABLE;
            lastEvent = 0;
            running = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME);
            if (!running) { call.reject("Не удалось включить датчик направления."); return; }
            getActivity().getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            JSObject result = new JSObject(); result.put("declination", declination); result.put("sensor", sensor.getStringType()); call.resolve(result);
        });
    }
    @PluginMethod public void keepAwake(PluginCall call) { getActivity().runOnUiThread(() -> { mapAwake = call.getBoolean("enabled", false); if (mapAwake || running) getActivity().getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getActivity().getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); call.resolve(); }); }
    @PluginMethod public void stop(PluginCall call) { getActivity().runOnUiThread(() -> { stopSensor(); call.resolve(); }); }
    private void stopSensor() {
        if (manager != null) manager.unregisterListener(this);
        running = false;
        if (!mapAwake && getActivity() != null) getActivity().getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    @Override public void handleOnPause() { mapAwake=false; stopSensor(); }
    @Override protected void handleOnDestroy() { mapAwake=false; stopSensor(); }
    @Override public void onAccuracyChanged(Sensor sensor, int status) { accuracy = status; }
    @Override public void onSensorChanged(SensorEvent event) {
        if (!running || event.timestamp - lastEvent < 30_000_000L) return;
        lastEvent = event.timestamp;
        SensorManager.getRotationMatrixFromVector(matrix, event.values);
        WindowManager wm = (WindowManager)getContext().getSystemService(Context.WINDOW_SERVICE);
        int displayRotation = wm.getDefaultDisplay().getRotation();
        int turns = displayRotation == Surface.ROTATION_90 ? 1 : displayRotation == Surface.ROTATION_180 ? 2 : displayRotation == Surface.ROTATION_270 ? 3 : 0;
        double[][] view = OrientationMath.camera(matrix, turns, declination);
        JSObject result = new JSObject();
        result.put("forward", JSArray.from(view[0])); result.put("right", JSArray.from(view[1])); result.put("up", JSArray.from(view[2]));
        result.put("accuracy", accuracy); result.put("timestamp", System.currentTimeMillis());
        if (event.values.length >= 5 && event.values[4] >= 0) result.put("headingError", Math.toDegrees(event.values[4]));
        result.put("declination", declination);
        notifyListeners("orientation", result);
    }
}
