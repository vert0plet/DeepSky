package ru.egorych.deepsky;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.opengl.GLSurfaceView;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Config;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingFailureReason;
import com.google.ar.core.exceptions.CameraNotAvailableException;
import com.google.ar.core.exceptions.UnavailableException;
import java.util.Locale;
import java.util.function.UnaryOperator;
import org.json.JSONException;
import org.json.JSONObject;

public class SkyCameraActivity extends AppCompatActivity implements SensorEventListener {
    static final String EXTRA_REQUEST = "sky-camera-request";
    private final float[] sensorMatrix = new float[9];
    private final Runnable refresh = this::refresh;
    private SkyCameraRequest request;
    private SkyCameraRequest.Target target;
    private SkyCameraOverlay overlay;
    private SensorManager sensors;
    private Sensor orientation;
    private long sensorAt;
    private int accuracy;
    private double declination;
    private int accent;
    private boolean resumed;
    private boolean installing;
    private int availabilityRequest;
    private FrameLayout previewHost;
    private GuidanceView guidance;
    private SkyCameraChrome chrome;
    private boolean arInstallAvailable;
    private boolean previewFailed;
    private String previewStatus = "Открываем камеру…";
    private enum CameraMode {
        NIGHT("Ночь"), AUTO("Авто"), AR("ARCore");
        final String label;
        CameraMode(String label) { this.label = label; }
    }
    private CameraMode cameraMode;
    private SharedPreferences cameraSettings;
    private String exposureStatus = "";
    private SkyCameraRequest.Target calibrationStar, anchorStar, secondStar;
    private UnaryOperator<SkyCameraMath.Basis> calibration;
    private String scaleKey;
    private double lensScale = 1;
    private SkyCameraMath.Optics baseOptics;
    private SkyCameraMath.Basis rawView, referenceAr, referenceSky;
    private SkyCameraMath.Optics optics;
    private int referenceEpoch = -1;
    private Session session;
    private String arCameraId;
    private boolean arResumed;
    private GLSurfaceView gl;
    private SkyArPreview ar;
    private SkyDevicePreview devicePreview;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        String payload = getIntent().getStringExtra(EXTRA_REQUEST);
        try {
            if (payload == null) throw new JSONException("Missing sky camera request");
            request = SkyCameraRequest.parse(new JSONObject(payload));
        } catch (JSONException | IllegalArgumentException e) {
            finish();
            return;
        }
        target = request.target();
        cameraSettings = getSharedPreferences("sky-camera-optics", MODE_PRIVATE);
        try { cameraMode = CameraMode.valueOf(cameraSettings.getString("mode", "NIGHT")); }
        catch (IllegalArgumentException e) { cameraMode = CameraMode.NIGHT; }
        overlay = new SkyCameraOverlay(this, request);
        installing = saved != null && saved.getBoolean("installing");
        sensors = getSystemService(SensorManager.class);
        orientation = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (orientation == null) orientation = sensors.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
        declination = new GeomagneticField((float) request.latitude(), (float) request.longitude(),
            0, System.currentTimeMillis()).getDeclination();
        accent = Color.parseColor(request.redMode() ? "#F28A77" : "#F3CB88");
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (request.redMode()) {
            var attrs = getWindow().getAttributes();
            attrs.screenBrightness = .12f;
            getWindow().setAttributes(attrs);
        }
        buildUi();
    }

    private void buildUi() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        var root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        previewHost = new FrameLayout(this);
        root.addView(previewHost, match());
        guidance = new GuidanceView();
        root.addView(guidance, match());

        chrome = new SkyCameraChrome(this, root, request.redMode(), accent,
            this::finish, this::showCameraControls, this::showLayers, this::chooseStar, this::clearGuide);
        chrome.exposure(cameraMode.label);
        chrome.guidance(null, "", false, false, false);
        setContentView(root);
        var bars = WindowCompat.getInsetsController(getWindow(), root);
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override protected void onResume() {
        super.onResume();
        if (request == null) return;
        resumed = true;
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            previewStatus = "Разреши DeepSky доступ к камере в настройках Android.";
            chrome.status("Камера закрыта", previewStatus, false);

            return;
        }
        sensorAt = 0;
        accuracy = SensorManager.SENSOR_STATUS_UNRELIABLE;
        if (orientation != null) sensors.registerListener(this, orientation, SensorManager.SENSOR_DELAY_GAME);
        if (session != null) resumeAr();
        else if (devicePreview == null) {
            if (cameraMode == CameraMode.AR) checkArAvailability();
            else startDeviceCamera("Наведение по датчикам", false);
        }
        guidance.post(refresh);
    }

    private void checkArAvailability() {
        int token = ++availabilityRequest;
        try {
            ArCoreApk.getInstance().checkAvailabilityAsync(this, availability -> runOnUiThread(() -> {
                if (!resumed || isFinishing() || token != availabilityRequest) return;
                if (installing || availability == ArCoreApk.Availability.SUPPORTED_INSTALLED) {
                    completeArInstall(false);
                } else {
                    startDeviceCamera(availability.isSupported()
                        ? "По датчикам · можно подключить ARCore" : "По датчикам · ARCore недоступен",
                        availability.isSupported());
                }
            }));
        } catch (RuntimeException | LinkageError e) {
            startDeviceCamera("По датчикам · ARCore недоступен", false);
        }
    }

    private void showLayers() {
        var sheet = chrome.new Sheet("Слои неба", "Выбери, что будет видно поверх живого кадра.");
        for (var layer : SkyCameraOverlay.Layer.values()) {
            String hint = switch (layer) {
                case FIGURES -> "Соединяет опорные звёзды";
                case NAMES -> "Подписывает созвездия и ориентиры";
                case STARS -> "Точки до 4,5 звёздной величины";
                case SOLAR -> "Метки Луны и планет";
                case DEEP -> "Яркие туманности, скопления и галактики";
                case DIM -> "Уменьшает яркость изображения";
            };
            sheet.toggle(layer.title, hint, overlay.enabled(layer), value -> overlay.set(layer, value));
        }
        sheet.show();
    }

    private void showCameraControls() {
        var sheet = chrome.new Sheet("Камера", exposureStatus.isEmpty()
            ? "Выбери, как камера будет видеть небо." : exposureStatus);
        for (CameraMode mode : CameraMode.values()) {
            String hint = switch (mode) {
                case NIGHT -> "Больше света · фокус на бесконечность";
                case AUTO -> "Автоэкспозиция · фокус на бесконечность";
                case AR -> "Трекинг камеры при достаточном свете · автоэкспозиция";
            };
            sheet.action(mode.label + (mode == cameraMode ? "  ✓" : ""), hint, () -> setCameraMode(mode));
        }
        if (arInstallAvailable) sheet.action("Установить ARCore", "Сервисы Google Play для AR", this::installArCore);
        sheet.action("О наведении", "", this::showArInfo);
        sheet.show();
    }

    private void setCameraMode(CameraMode mode) {
        if (mode == cameraMode && (mode != CameraMode.AR || ar != null)) return;
        cameraMode = mode;
        cameraSettings.edit().putString("mode", mode.name()).apply();
        chrome.exposure(mode.label);
        exposureStatus = "";
        availabilityRequest++;
        if (mode != CameraMode.AR && devicePreview != null && !arInstallAvailable) {
            devicePreview.night(mode == CameraMode.NIGHT);
        } else {
            resetAlignment();
            scaleKey = null;
            stopDeviceCamera();
            releaseAr();
            if (mode == CameraMode.AR) {
                previewStatus = "Проверяем ARCore…";
                checkArAvailability();
            } else startDeviceCamera("Наведение по датчикам", false);
        }
    }

    private void showArInfo() {
        var sheet = chrome.new Sheet("О наведении",
            "DeepSky рассчитывает положение объектов по координатам площадки и текущему времени. "
                + "Для уточнения поворотов камеры приложение может использовать Google Play Services for AR (ARCore). "
                + "Работа этих сервисов регулируется условиями и политикой конфиденциальности Google.");
        if (arInstallAvailable) sheet.action("Подключить ARCore", "Сервисы Google для отслеживания камеры", this::installArCore);
        sheet.action("Политика конфиденциальности Google", "", () -> {
            var intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://policies.google.com/privacy"));
            try { startActivity(intent); }
            catch (android.content.ActivityNotFoundException e) {
                android.widget.Toast.makeText(this, "policies.google.com/privacy", android.widget.Toast.LENGTH_LONG).show();
            }
        });
        sheet.show();
    }

    private void installArCore() {
        stopDeviceCamera();
        arInstallAvailable = false;
        completeArInstall(true);
    }

    private void completeArInstall(boolean userRequested) {
        try {
            var result = ArCoreApk.getInstance().requestInstall(this, userRequested);
            installing = result == ArCoreApk.InstallStatus.INSTALL_REQUESTED;
            if (!installing) startAr();
        } catch (UnavailableException | RuntimeException | LinkageError e) {
            installing = false;
            startDeviceCamera("По датчикам · ARCore не подключён", true);
        }
    }

    private void startAr() {
        try {
            arInstallAvailable = false;
            session = new Session(this);
            Config config = session.getConfig();
            config.setPlaneFindingMode(Config.PlaneFindingMode.DISABLED);
            config.setLightEstimationMode(Config.LightEstimationMode.DISABLED);
            arCameraId = session.getCameraConfig().getCameraId();
            config.setFocusMode(Config.FocusMode.FIXED);
            session.configure(config);
            session.resume();
            arResumed = true;

            Session owner = session;
            ar = new SkyArPreview(session, () -> runOnUiThread(() -> {
                if (session == owner && ar != null && cameraMode == CameraMode.AR && !isFinishing()) switchFromAr();
            }));
            ar.rotation = displayRotation();
            var surface = new GLSurfaceView(this);
            surface.setEGLContextClientVersion(2);
            surface.setRenderer(ar);
            gl = surface;
            previewHost.addView(gl, match());
            previewStatus = "Запускаем ARCore…";
            exposureStatus = "ARCore · автоэкспозиция";
        } catch (UnavailableException | CameraNotAvailableException | RuntimeException | LinkageError e) {
            switchFromAr();
        }
    }

    private void resumeAr() {
        try {
            session.resume();
            arResumed = true;
            gl.onResume();
        } catch (CameraNotAvailableException | RuntimeException e) {
            switchFromAr();
        }
    }

    private void switchFromAr() {
        releaseAr();
        resetAlignment();
        if (resumed) startDeviceCamera("По датчикам · ARCore не запустился", false);
    }

    private void pauseAr() {
        if (gl != null) gl.onPause();
        if (arResumed) {
            session.pause();
            arResumed = false;
        }
        if (ar != null) ar.sample = null;
        referenceEpoch = -1;
    }

    private void releaseAr() {
        pauseAr();
        if (gl != null) {
            previewHost.removeView(gl);
            gl = null;
        }
        ar = null;
        if (session != null) {
            Session closedSession = session;
            session = null;
            // Closing a paused ARCore session can take several seconds.
            new Thread(closedSession::close, "DeepSky AR cleanup").start();
        }
    }

    private void startDeviceCamera(String message, boolean canInstall) {
        previewStatus = message;
        arInstallAvailable = canInstall;
        previewFailed = false;
        devicePreview = new SkyDevicePreview(this, previewHost, cameraMode == CameraMode.NIGHT,
            () -> previewFailed = true, description -> exposureStatus = description);
    }

    private void stopDeviceCamera() {
        if (devicePreview == null) return;
        devicePreview.close();
        devicePreview = null;
    }

    @Override protected void onPause() {
        resumed = false;
        availabilityRequest++;
        if (guidance != null) guidance.removeCallbacks(refresh);
        if (sensors != null) sensors.unregisterListener(this);
        rawView = null;
        pauseAr();
        super.onPause();
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        out.putBoolean("installing", installing);
        super.onSaveInstanceState(out);
    }

    @Override protected void onDestroy() {
        releaseAr();
        stopDeviceCamera();
        super.onDestroy();
    }

    @Override public void onSensorChanged(SensorEvent event) {
        SensorManager.getRotationMatrixFromVector(sensorMatrix, event.values);
        sensorAt = SystemClock.elapsedRealtime();
    }

    @Override public void onAccuracyChanged(Sensor sensor, int value) {
        accuracy = value;
    }

    private void refresh() {
        if (!resumed) return;
        int rotation = displayRotation();
        if (ar != null) ar.rotation = rotation;
        var sample = ar != null ? ar.sample : null;
        if (sample != null && (sample.rotation() != rotation
            || SystemClock.elapsedRealtime() - sample.receivedAt() > 500)) sample = null;
        var sensorView = sensorAt != 0 && SystemClock.elapsedRealtime() - sensorAt < 1500
            ? SkyCameraMath.Basis.of(OrientationMath.camera(sensorMatrix, rotation, declination)) : null;
        rawView = sensorView;
        baseOptics = sample != null ? sample.optics() : devicePreview != null ? devicePreview.optics(rotation) : null;
        if (baseOptics != null) {
            String key = sample != null && session != null ? "ar:" + arCameraId
                : devicePreview == null ? null : "direct:" + devicePreview.cameraId();
            if (!java.util.Objects.equals(scaleKey, key)) {
                scaleKey = key;
                lensScale = key == null ? 1 : cameraSettings.getFloat(key, 1);
                if (!(lensScale >= SkyCameraMath.MIN_SCALE && lensScale <= SkyCameraMath.MAX_SCALE)) lensScale = 1;
            }
        }
        optics = baseOptics == null ? null : baseOptics.scaled(lensScale);
        if (sample != null && sample.basis() != null) {
            if (referenceEpoch != sample.trackingEpoch() && sensorView != null) {
                referenceAr = sample.basis();
                referenceSky = sensorView;
                referenceEpoch = sample.trackingEpoch();
            }
            if (referenceEpoch == sample.trackingEpoch()) {
                rawView = SkyCameraMath.alignAr(referenceAr, referenceSky, sample.basis());
            }
        } else {
            referenceEpoch = -1;
        }

        boolean tracking = referenceEpoch >= 0;
        String mode = previewStatus;
        String caption = devicePreview != null ? "По датчикам" : "Запуск камеры";
        if (sample != null) {
            mode = tracking ? "ARCore · трекинг камеры"
                : sample.reason() == TrackingFailureReason.INSUFFICIENT_LIGHT ? "Мало света · наведение по датчикам"
                : "ARCore ищет ориентиры · наведение по датчикам";
            caption = tracking ? "ARCore · трекинг" : "По датчикам";
        }
        if (rawView != null && calibration != null) {
            caption += " · привязка";
            mode += " · после привязки";
        } else if (rawView != null && accuracy < SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM) {
            mode += " · компас неточный";
            if (!tracking) caption = "Компас неточный";
        }
        if (devicePreview != null && previewFailed && optics == null) {
            caption = "Камера недоступна";
            mode = "Вернись на карту и попробуй открыть камеру снова.";
        }
        chrome.status(caption, exposureStatus.isEmpty() ? mode : mode + " · " + exposureStatus, tracking);

        SkyCameraMath.Aim aim = null;
        var view = rawView == null || calibration == null ? rawView : calibration.apply(rawView);
        String title = null, detail = "";
        long now = System.currentTimeMillis();
        if (secondStar != null) {
            title = "Масштаб · " + secondStar.name();
            detail = "Держи " + anchorStar.name() + " в центре и коснись второй звезды в кадре";
        } else if (calibrationStar != null) {
            title = calibrationStar.name();
            detail = "Совмести звезду с прицелом";
        } else if (target != null) {
            double[] direction = request.direction(target, now);
            title = target.name();
            if (direction[2] < 0) detail = "Сейчас под горизонтом";
            else if (view != null && optics != null) {
                aim = SkyCameraMath.aim(view, optics, direction);
                detail = String.format(Locale.forLanguageTag("ru"), "%.1f° от прицела", aim.angle());
            } else detail = "Определяем направление";
        } else if (orientation == null) {
            title = "Датчик направления недоступен";
            detail = "Для наведения нужен компас телефона";
        }
        chrome.guidance(title, detail, calibrationStar != null, secondStar != null, view != null && optics != null);
        guidance.aim = aim;
        guidance.camera = view;
        guidance.now = now;
        guidance.invalidate();
        guidance.postOnAnimationDelayed(refresh, 25);
    }

    private void chooseStar() {
        if (secondStar != null) return;
        if (calibrationStar != null) {
            if (rawView == null || optics == null) return;
            var from = SkyCameraMath.opticalCenter(rawView, optics);
            var to = request.direction(calibrationStar, System.currentTimeMillis());
            calibration = SkyCameraMath.Rotation.between(from, to)::apply;
            anchorStar = calibrationStar;
            calibrationStar = null;
            return;
        }
        var stars = request.stars();
        var sheet = chrome.new Sheet("Привязка по звезде", stars.isEmpty()
            ? "Сейчас нет подходящих ярких звёзд высоко над горизонтом."
            : "Выбери звезду и совмести её с прицелом.");
        if (anchorStar != null) sheet.action("Уточнить масштаб", "По двум звёздам в одном кадре", this::chooseSecondStar);
        if (calibration != null) sheet.action("Сбросить привязку", "Сохранённый масштаб останется", this::resetAlignment);
        if (scaleKey != null && lensScale != 1) sheet.action("Сбросить масштаб", "Вернуть заводское поле камеры", () -> {
            cameraSettings.edit().remove(scaleKey).apply();
            lensScale = 1;
            resetAlignment();
        });
        long now = System.currentTimeMillis();
        for (var star : stars) {
            var direction = request.direction(star, now);
            long altitude = Math.round(Math.toDegrees(Math.asin(direction[2])));
            if (altitude < 10) continue;
            sheet.action(star.name(), "Высота " + altitude + "°", () -> calibrationStar = star);
        }
        sheet.show();
    }

    private void chooseSecondStar() {
        if (anchorStar == null || optics == null) return;
        var sheet = chrome.new Sheet("Вторая звезда",
            "Выбери звезду, которую можно увидеть рядом с " + anchorStar.name()
                + ". Обе должны быть в одном кадре.");
        long now = System.currentTimeMillis();
        var first = request.direction(anchorStar, now);
        int count = 0;
        for (var star : request.stars()) {
            if (star == anchorStar) continue;
            var direction = request.direction(star, now);
            double gap = SkyCameraMath.separation(first, direction);
            if (gap < 5 || gap > 32 || direction[2] < 0) continue;
            count++;
            sheet.action(star.name(), String.format(Locale.forLanguageTag("ru"), "%.0f° от первой", gap),
                () -> secondStar = star);
        }
        if (count == 0) sheet.action("Выбрать другую первую звезду", "Подходящей пары поблизости нет", this::chooseStar);
        sheet.show();
    }

    private void fitScale(double x, double y) {
        if (rawView == null || baseOptics == null || scaleKey == null || anchorStar == null) return;
        long now = System.currentTimeMillis();
        var first = request.direction(anchorStar, now);
        var second = request.direction(secondStar, now);
        if (calibration == null || SkyCameraMath.separation(
            SkyCameraMath.opticalCenter(calibration.apply(rawView), optics), first) > 3) {
            notifyUser("Верни первую звезду в центр прицела.");
            return;
        }
        var result = SkyCameraMath.alignPair(rawView, baseOptics, x, y, first, second);
        if (result == null) {
            notifyUser("Не удалось подобрать масштаб. Совмести первую звезду с центром и коснись второй.");
            return;
        }
        lensScale = result.scale();
        cameraSettings.edit().putFloat(scaleKey, (float) lensScale).apply();
        calibration = result::apply;
        secondStar = null;
        notifyUser("Масштаб сохранён");
    }

    private void notifyUser(String text) {
        android.widget.Toast.makeText(this, text, android.widget.Toast.LENGTH_SHORT).show();
    }

    private void resetAlignment() {
        calibration = null;
        anchorStar = null;
        secondStar = null;
        calibrationStar = null;
    }

    private void clearGuide() {
        if (secondStar != null) secondStar = null;
        else if (calibrationStar != null) calibrationStar = null;
        else target = null;
    }

    private int displayRotation() { return getWindowManager().getDefaultDisplay().getRotation(); }
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private static FrameLayout.LayoutParams match() { return new FrameLayout.LayoutParams(-1, -1); }

    private final class GuidanceView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path arrow = new Path();
        private SkyCameraMath.Aim aim;
        private SkyCameraMath.Basis camera;
        private long now;
        private float touchX, touchY;

        GuidanceView() { super(SkyCameraActivity.this); }

        @Override public boolean onTouchEvent(MotionEvent event) {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                touchX = event.getX();
                touchY = event.getY();
            } else if (event.getActionMasked() == MotionEvent.ACTION_UP && calibrationStar == null
                && Math.hypot(touchX - event.getX(), touchY - event.getY()) <= dp(12)) {
                if (secondStar != null) {
                    fitScale(event.getX() / getWidth(), event.getY() / getHeight());
                    performClick();
                    return true;
                }
                var selected = overlay.pick(event.getX(), event.getY());
                if (selected != null) {
                    target = selected;
                    performClick();
                }
            }
            return true;
        }

        @Override public boolean performClick() {
            super.performClick();
            return true;
        }

        @Override protected void onDraw(Canvas canvas) {
            overlay.draw(canvas, getWidth(), getHeight(), chrome.top.getBottom(), chrome.bottom.getTop(),
                camera, optics, now, calibrationStar != null || secondStar != null, target);
            if (target == null && calibrationStar == null && secondStar == null) return;
            float centerX = getWidth() / 2f;
            float centerY = getHeight() / 2f;
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(2));
            paint.setColor(request.redMode() ? 0xbbdb9b8b : 0xbbe5edf4);
            canvas.drawCircle(centerX, centerY, dp(11), paint);
            canvas.drawLine(centerX - dp(17), centerY, centerX - dp(8), centerY, paint);
            canvas.drawLine(centerX + dp(8), centerY, centerX + dp(17), centerY, paint);
            canvas.drawLine(centerX, centerY - dp(17), centerX, centerY - dp(8), paint);
            canvas.drawLine(centerX, centerY + dp(8), centerX, centerY + dp(17), paint);
            if (aim == null) return;
            paint.setColor(accent);
            float x = (float) (aim.x() * getWidth());
            float y = (float) (aim.y() * getHeight());
            if (aim.inFrame() && x > dp(18) && x < getWidth() - dp(18)
                && y > chrome.top.getBottom() + dp(18) && y < chrome.bottom.getTop() - dp(18)) {
                canvas.drawCircle(x, y, dp(15), paint);
                paint.setStyle(Paint.Style.FILL);
                canvas.drawCircle(x, y, dp(3), paint);
                return;
            }
            drawArrow(canvas, centerX, centerY, aim, x, y);
        }

        private void drawArrow(Canvas canvas, float centerX, float centerY, SkyCameraMath.Aim aim, float x, float y) {
            double heading = Math.atan2(y - centerY, x - centerX);
            if (aim.behind()) heading = Math.atan2(aim.arrowY() * getHeight(), aim.arrowX() * getWidth());
            float radius = Math.min(dp(75), Math.min(centerX, centerY) / 2);
            canvas.save();
            canvas.translate(centerX + radius * (float) Math.cos(heading), centerY + radius * (float) Math.sin(heading));
            canvas.rotate((float) Math.toDegrees(heading));
            arrow.reset();
            arrow.moveTo(dp(12), 0);
            arrow.lineTo(-dp(6), -dp(9));
            arrow.lineTo(-dp(2), 0);
            arrow.lineTo(-dp(6), dp(9));
            arrow.close();
            paint.setStyle(Paint.Style.FILL);
            canvas.drawPath(arrow, paint);
            canvas.restore();
        }
    }
}
