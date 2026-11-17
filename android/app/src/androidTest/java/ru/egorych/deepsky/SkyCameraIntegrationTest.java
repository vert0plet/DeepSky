package ru.egorych.deepsky;

import android.Manifest;
import android.app.Instrumentation;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.inspector.WindowInspector;
import android.widget.Checkable;
import java.util.ArrayList;
import androidx.camera.view.PreviewView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;


@RunWith(AndroidJUnit4.class)
public class SkyCameraIntegrationTest {
    @Test public void opensRearCameraFromMapAndReturnsToSameTarget() throws Exception {
        Assume.assumeTrue("Camera preview test needs the AOSP emulator virtual camera", "ranchu".equals(Build.HARDWARE) && Build.VERSION.SDK_INT >= 29);
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        var context = instrumentation.getTargetContext();
        instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.CAMERA);
        var layerPrefs = context.getSharedPreferences("sky-camera-layers", android.content.Context.MODE_PRIVATE);
        layerPrefs.edit().remove("STARS").remove("FIGURES").apply();
        var cameraPrefs = context.getSharedPreferences("sky-camera-optics", android.content.Context.MODE_PRIVATE);
        cameraPrefs.edit().remove("mode").apply();
        try (var map = ActivityScenario.launch(MainActivity.class)) {
            awaitMap(map, "!!document.querySelector('[data-view=sky]')");
            evaluate(map, """
                document.querySelector('[data-view=settings]').click();
                const latitude = document.querySelector('#settings-page [name=latitude]');
                latitude.value = '56';
                latitude.dispatchEvent(new Event('change', {bubbles:true}));
                document.querySelector('[data-view=sky]').click();
                """);
            awaitMap(map, "!!document.querySelector('#pl-camera') && document.querySelector('#pl-selection').hidden");
            var free = openCamera(instrumentation, map, "#pl-camera");
            try {
                var payload = new JSONObject(free.getIntent().getStringExtra(SkyCameraActivity.EXTRA_REQUEST));
                assertTrue(payload.isNull("target"));
                assertTrue(payload.getJSONArray("marks").length() > 900);
                assertTrue(payload.getJSONArray("figures").length() >= 88);
                checkAndToggleStarLayer(instrumentation, free, false);
                switchExposure(instrumentation, free, "Ночь", "Авто");
                assertEquals("AUTO", cameraPrefs.getString("mode", null));
                awaitPreview(instrumentation, free);
            } finally {
                instrumentation.runOnMainSync(free::finish);
            }
            awaitMap(map, "!!document.querySelector('#pl-camera')");
            evaluate(map, """
                document.querySelector('#pl-search-toggle').click();
                const search = document.querySelector('#pl-search');
                search.value = 'M31';
                search.dispatchEvent(new Event('input', {bubbles:true}));
                document.querySelector('#pl-results button').click();
                """);
            awaitMap(map, "!!document.querySelector('[data-sky-action=camera]')");
            var opened = openCamera(instrumentation, map, "[data-sky-action=camera]");
            try {
                checkAndToggleStarLayer(instrumentation, opened, true);
                switchExposure(instrumentation, opened, "Авто", "Ночь");
                assertEquals("NIGHT", cameraPrefs.getString("mode", null));
                awaitPreview(instrumentation, opened);
            } finally {
                instrumentation.runOnMainSync(opened::finish);
            }
            awaitMap(map, "document.querySelector('#pl-selection strong')?.textContent === 'M 31'");
        } finally {
            cameraPrefs.edit().remove("mode").apply();
            layerPrefs.edit().remove("STARS").remove("FIGURES").apply();
        }
    }

    @androidx.annotation.RequiresApi(29)
    private static void checkAndToggleStarLayer(Instrumentation instrumentation, SkyCameraActivity activity,
                                                boolean initiallyChecked) {
        instrumentation.runOnMainSync(() -> {
            View control = findByDescription(activity.getWindow().getDecorView(), "Слои неба");
            assertNotNull(control);
            assertTrue(control.performClick());
        });
        instrumentation.waitForIdleSync();
        instrumentation.runOnMainSync(() -> {
            for (View root : WindowInspector.getGlobalWindowViews()) {
                View stars = findByDescription(root, "Точки звёзд");
                if (!(stars instanceof Checkable checkable)) continue;
                var figures = findByDescription(root, "Линии созвездий");
                assertTrue(figures instanceof Checkable && ((Checkable) figures).isChecked());
                assertEquals(initiallyChecked, checkable.isChecked());
                stars.performClick();
                assertEquals(!initiallyChecked, checkable.isChecked());
                View close = findByDescription(root, "Закрыть панель");
                assertNotNull(close);
                View panel = (View) close.getParent().getParent();
                View safeFrame = (View) panel.getParent();
                int minimumGap = Math.round(14 * panel.getResources().getDisplayMetrics().density);
                assertTrue("The panel frame needs a bottom margin", safeFrame.getPaddingBottom() >= minimumGap);
                assertTrue(close.performClick());
                return;
            }
            fail("The layer panel did not open");
        });
    }

    @androidx.annotation.RequiresApi(29)
    private static void switchExposure(Instrumentation instrumentation, SkyCameraActivity activity,
                                       String from, String to) {
        instrumentation.runOnMainSync(() -> {
            var button = findByDescription(activity.getWindow().getDecorView(), "Режим камеры: " + from);
            assertNotNull(button);
            assertTrue(button.performClick());
        });
        instrumentation.waitForIdleSync();
        instrumentation.runOnMainSync(() -> {
            for (View root : WindowInspector.getGlobalWindowViews()) {
                var items = new ArrayList<View>();
                root.findViewsWithText(items, to, View.FIND_VIEWS_WITH_TEXT);
                for (View item : items) {
                    if (item instanceof android.widget.TextView label && to.contentEquals(label.getText())) {
                        View row = (View) item.getParent().getParent();
                        assertTrue(row.performClick());
                        assertNotNull(findByDescription(activity.getWindow().getDecorView(), "Режим камеры: " + to));
                        return;
                    }
                }
            }
            fail("Exposure setting not shown: " + to);
        });
    }

    private static View findByDescription(View root, String description) {
        var results = new ArrayList<View>();
        root.findViewsWithText(results, description, View.FIND_VIEWS_WITH_CONTENT_DESCRIPTION);
        return results.isEmpty() ? null : results.get(0);
    }

    private static SkyCameraActivity openCamera(Instrumentation instrumentation, ActivityScenario<MainActivity> map,
                                                String selector) throws InterruptedException {
        var monitor = instrumentation.addMonitor(SkyCameraActivity.class.getName(), null, false);
        try {
            evaluate(map, "document.querySelector('" + selector + "').click()");
            var opened = monitor.waitForActivityWithTimeout(10000);
            assertTrue("The map button must launch the camera activity", opened instanceof SkyCameraActivity);
            var camera = (SkyCameraActivity) opened;
            awaitPreview(instrumentation, camera);
            return camera;
        } finally {
            instrumentation.removeMonitor(monitor);
        }
    }

    private static void awaitPreview(Instrumentation instrumentation, SkyCameraActivity activity) throws InterruptedException {
        var streaming = new AtomicBoolean();
        for (int i = 0; i < 100 && !streaming.get(); i++) {
            instrumentation.runOnMainSync(() -> {
                PreviewView preview = findPreview(activity.findViewById(android.R.id.content));
                streaming.set(preview != null && preview.getPreviewStreamState().getValue() == PreviewView.StreamState.STREAMING);
            });
            if (!streaming.get()) Thread.sleep(150);
        }
        assertTrue("The fallback preview did not stream", streaming.get());
    }

    private static void awaitMap(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        for (int i = 0; i < 50; i++) {
            if ("true".equals(evaluate(scenario, expression))) return;
            Thread.sleep(200);
        }
        fail("Map did not reach the expected state: " + expression);
    }

    private static String evaluate(ActivityScenario<MainActivity> scenario, String script) throws InterruptedException {
        var value = new AtomicReference<String>();
        var done = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, result -> {
            value.set(result);
            done.countDown();
        }));
        assertTrue(done.await(5, TimeUnit.SECONDS));
        return value.get();
    }

    private static PreviewView findPreview(View view) {
        if (view instanceof PreviewView preview) return preview;
        if (view instanceof ViewGroup group) {
            for (int i = 0; i < group.getChildCount(); i++) {
                var preview = findPreview(group.getChildAt(i));
                if (preview != null) return preview;
            }
        }
        return null;
    }
}
