package ru.egorych.deepsky;

import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CaptureRequest;
import android.os.Build;
import android.util.Range;
import android.view.ViewGroup;
import androidx.annotation.OptIn;
import androidx.camera.camera2.interop.Camera2CameraInfo;
import androidx.camera.camera2.interop.Camera2CameraControl;
import androidx.camera.camera2.interop.CaptureRequestOptions;
import androidx.camera.core.Camera;
import java.util.function.Consumer;
import androidx.camera.camera2.interop.ExperimentalCamera2Interop;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

/** Direct camera preview with capture controls independent of ARCore. */
final class SkyDevicePreview {
    private final PreviewView view;
    private final Preview preview;
    private ProcessCameraProvider provider;
    private boolean closed, night;
    private Camera activeCamera;
    private int settingsRevision;
    private final Consumer<String> onSettings;
    private final java.util.concurrent.Executor main;
    private String cameraId;
    private double sensorWidth, sensorHeight, focal;

    SkyDevicePreview(SkyCameraActivity activity, ViewGroup host, boolean night,
                     Runnable onError, Consumer<String> onSettings) {
        this.night = night;
        this.onSettings = onSettings;
        main = ContextCompat.getMainExecutor(activity);
        view = new PreviewView(activity);
        view.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        host.addView(view, new ViewGroup.LayoutParams(-1, -1));
        preview = new Preview.Builder().build();
        preview.setSurfaceProvider(view.getSurfaceProvider());
        var pending = ProcessCameraProvider.getInstance(activity);
        pending.addListener(() -> {
            if (closed || activity.isDestroyed() || activity.isFinishing()) return;
            try {
                provider = pending.get();
                var camera = provider.bindToLifecycle(activity, CameraSelector.DEFAULT_BACK_CAMERA, preview);
                activeCamera = camera;
                readOptics(camera.getCameraInfo());
                configure(night, true);
                camera.getCameraInfo().getCameraState().observe(activity, state -> {
                    if (!closed && state.getError() != null) onError.run();
                });
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                onError.run();
            } catch (java.util.concurrent.ExecutionException | RuntimeException e) {
                onError.run();
            }
        }, main);
    }

    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private void readOptics(androidx.camera.core.CameraInfo info) {
        var camera = Camera2CameraInfo.from(info);
        cameraId = camera.getCameraId();
        var sensor = camera.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
        var focals = camera.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
        if (sensor != null && focals != null && focals.length > 0 && focals[0] > 0) {
            sensorWidth = sensor.getWidth();
            sensorHeight = sensor.getHeight();
            focal = focals[0];
        }
    }

    String cameraId() { return cameraId; }

    void night(boolean value) {
        night = value;
        if (activeCamera != null) configure(value, true);
    }

    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private void configure(boolean night, boolean tryEnhancement) {
        int revision = ++settingsRevision;
        var info = Camera2CameraInfo.from(activeCamera.getCameraInfo());
        var control = Camera2CameraControl.from(activeCamera.getCameraControl());
        var options = new CaptureRequestOptions.Builder();
        var focus = info.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
        boolean fixed = focus != null && focus == 0;
        boolean infinity = focus != null && focus > 0;
        if (infinity) {
            options.setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF);
            options.setCaptureRequestOption(CaptureRequest.LENS_FOCUS_DISTANCE, 0f);
        }
        String message = night ? "Ночь · автоэкспозиция" : "Автоэкспозиция";
        if (night && tryEnhancement) message = nightExposure(info, options);
        if (infinity) message += " · ∞";
        else if (fixed) message += " · фикс. фокус";
        String description = message;
        onSettings.accept("Настраиваем экспозицию…");
        var pending = control.setCaptureRequestOptions(options.build());
        pending.addListener(() -> {
            if (closed || revision != settingsRevision) return;
            try {
                pending.get();
                onSettings.accept(description);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (java.util.concurrent.ExecutionException e) {
                if (night && tryEnhancement) configure(true, false);
                else onSettings.accept("Настройки камеры недоступны");
            }
        }, main);
    }

    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private static String nightExposure(Camera2CameraInfo info, CaptureRequestOptions.Builder options) {
        var modes = info.getCameraCharacteristic(CameraCharacteristics.CONTROL_AE_AVAILABLE_MODES);
        if (Build.VERSION.SDK_INT >= 35
            && contains(modes, CaptureRequest.CONTROL_AE_MODE_ON_LOW_LIGHT_BOOST_BRIGHTNESS_PRIORITY)) {
            options.setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE,
                CaptureRequest.CONTROL_AE_MODE_ON_LOW_LIGHT_BOOST_BRIGHTNESS_PRIORITY);
            var rates = info.getCameraCharacteristic(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
            Range<Integer> rate = null;
            if (rates != null) for (var candidate : rates) {
                if (candidate.getUpper() <= 30 && (rate == null || candidate.getLower() < rate.getLower())) rate = candidate;
            }
            if (rate != null) options.setCaptureRequestOption(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, rate);
            return "Ночь · усиление света";
        }

        var capabilities = info.getCameraCharacteristic(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
        var exposure = info.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE);
        var sensitivity = info.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE);
        var maxFrame = info.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_MAX_FRAME_DURATION);
        if (contains(capabilities, CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR)
            && contains(modes, CaptureRequest.CONTROL_AE_MODE_OFF)
            && exposure != null && sensitivity != null && maxFrame != null && maxFrame >= exposure.getLower()) {
            long duration = Math.min(exposure.clamp(125_000_000L), maxFrame);
            int iso = sensitivity.clamp(6400);
            options.setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_OFF);
            options.setCaptureRequestOption(CaptureRequest.SENSOR_EXPOSURE_TIME, duration);
            options.setCaptureRequestOption(CaptureRequest.SENSOR_FRAME_DURATION, Math.min(maxFrame, duration + 8_000_000L));
            options.setCaptureRequestOption(CaptureRequest.SENSOR_SENSITIVITY, iso);
            return "Ночь · " + Math.round(duration / 1e6) + " мс · ISO " + iso;
        }
        var range = info.getCameraCharacteristic(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE);
        var step = info.getCameraCharacteristic(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP);
        if (range != null && step != null && step.doubleValue() > 0 && range.getUpper() > 0) {
            options.setCaptureRequestOption(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION,
                range.clamp((int) Math.round(2 / step.doubleValue())));
            return "Ночь · светлее";
        }
        return "Ночь · автоэкспозиция";
    }

    private static boolean contains(int[] values, int wanted) {
        if (values != null) for (int value : values) if (value == wanted) return true;
        return false;
    }

    SkyCameraMath.Optics optics(int rotation) {
        if (preview.getTargetRotation() != rotation) preview.setTargetRotation(rotation);
        var resolution = preview.getResolutionInfo();
        int width = view.getWidth();
        int height = view.getHeight();
        if (width == 0 || height == 0 || resolution == null
            || view.getPreviewStreamState().getValue() != PreviewView.StreamState.STREAMING) return null;
        if (focal <= 0 || sensorWidth <= 0 || sensorHeight <= 0) {
            // Approximate 60° on the short side when the device omits optical metadata.
            double pixels = Math.min(width, height) / (2 * Math.tan(Math.PI / 6));
            return new SkyCameraMath.Optics(pixels / width, pixels / height, .5, .5);
        }
        boolean rotated = resolution.getRotationDegrees() % 180 != 0;
        int bufferWidth = resolution.getResolution().getWidth();
        int bufferHeight = resolution.getResolution().getHeight();
        return SkyCameraMath.Optics.cropped(rotated ? sensorHeight : sensorWidth,
            rotated ? sensorWidth : sensorHeight, focal, rotated ? bufferHeight : bufferWidth,
            rotated ? bufferWidth : bufferHeight, width, height);
    }

    void close() {
        closed = true;
        if (provider != null) provider.unbind(preview);
        if (view.getParent() instanceof ViewGroup host) host.removeView(view);
    }
}
