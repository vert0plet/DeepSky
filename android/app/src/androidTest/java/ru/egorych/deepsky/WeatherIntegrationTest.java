package ru.egorych.deepsky;

import android.Manifest;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.service.notification.StatusBarNotification;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class WeatherIntegrationTest {
    @Test public void postsOnlyOnceAndOpensTonightFromNotification() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        if (Build.VERSION.SDK_INT >= 33) {
            instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(),
                Manifest.permission.POST_NOTIFICATIONS);
        }
        var preferences = context.getSharedPreferences("observing-weather", Context.MODE_PRIVATE);
        long previousNotice = preferences.getLong("lastNotified", Long.MIN_VALUE);
        preferences.edit().remove("lastNotified").apply();

        // Public test location and a fixed forecast window. This test does not depend on live weather.
        var site = new WeatherForecast.Site(55.75, 37.62, 10800);
        long now = Instant.parse("2026-11-09T15:00:00Z").getEpochSecond();
        var window = new WeatherForecast.Window(now + 3600, now + 3 * 3600);
        var manager = context.getSystemService(NotificationManager.class);
        PendingIntent open;
        try {
            WeatherAlerts.configure(context, site, true);
            assertEquals(site, WeatherAlerts.site(context));
            WeatherAlerts.notifyClearWindow(context, site, window, now);
            var active = awaitNotifications(manager, 1);
            assertEquals(1, active.length);
            var notification = active[0].getNotification();
            assertEquals("Ожидается ясное небо", notification.extras.getString("android.title"));
            assertEquals("Ясное окно 19:00–21:00 по времени площадки", notification.extras.getString("android.text"));
            open = notification.contentIntent;
            assertFalse(WeatherAlerts.shouldCheck(context, site, now + 1));
            WeatherAlerts.notifyClearWindow(context, site, window, now + 1);
            assertEquals(active[0].getPostTime(), manager.getActiveNotifications()[0].getPostTime());
        } finally {
            WeatherAlerts.disable(context);
            preferences.edit().putLong("lastNotified", previousNotice).apply();
        }

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertEquals("true", awaitJavascript(scenario, "document.querySelector('h1')?.textContent==='Каталог объектов'"));
            open.send();
            assertEquals("true", awaitJavascript(scenario, "document.querySelector('h1')?.textContent==='Сегодня ночью'"));
        }
        Intent launch = new Intent(Intent.ACTION_VIEW, Uri.parse("deepsky://weather/tonight"), context, MainActivity.class);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(launch)) {
            assertEquals("true", awaitJavascript(scenario,
                "document.querySelector('h1')?.textContent==='Сегодня ночью' && !!document.querySelector('#weather-title')"));
            scenario.onActivity(activity -> assertNotNull(activity.getBridge().getPlugin("WeatherAlerts")));
        }
    }

    @Test public void keepsForecastActionsInACollapsedMenu() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertEquals("true", awaitJavascript(scenario, "!!document.querySelector('[data-view=settings]')"));
            evaluate(scenario, """
                const currentFetch = window.fetch.bind(window);
                window.fetch = (url, settings) => {
                  if (!String(url).includes('api.open-meteo.com')) return currentFetch(url, settings);
                  const hourly = {};
                  const start = Math.floor(Date.now() / 3_600_000) * 3600;
                  hourly.time = Array.from({length:72}, (_, i) => start + i * 3600);
                  for (const [key,value] of Object.entries({cloud_cover:5,precipitation_probability:0,
                    precipitation:0,temperature_2m:3,wind_speed_10m:7})) hourly[key] = Array(72).fill(value);
                  return Promise.resolve(new Response(JSON.stringify({hourly})));
                };
                document.querySelector('[data-view=settings]').click();
                const place = document.querySelector('#settings-page [name=place]');
                place.value = 'Площадка для проверки';
                place.dispatchEvent(new Event('change', {bubbles:true}));
                document.querySelector('[data-view=tonight]').click();
                """);
            assertEquals("true", awaitJavascript(scenario, "!!document.querySelector('[data-action=weather-enable]')"));
            evaluate(scenario, "document.querySelector('[data-action=weather-enable]').click()");
            assertEquals("true", awaitJavascript(scenario,
                "document.querySelector('.weather-location')?.textContent === 'Площадка для проверки'"));
            assertEquals("true", evaluate(scenario, """
                (() => {
                  const menu = document.querySelector('.weather-options');
                  const disable = menu.querySelector('[data-action=weather-disable]');
                  return !menu.open && !disable.checkVisibility({contentVisibilityAuto:true});
                })()
                """));
            assertEquals("true", evaluate(scenario, """
                (() => {
                  const menu = document.querySelector('.weather-options');
                  menu.querySelector('summary').click();
                  const pop = menu.querySelector('.weather-option-menu');
                  const actions = pop.querySelectorAll('[data-action]');
                  const rect = pop.getBoundingClientRect();
                  return menu.open && actions.length === 2 && rect.left >= 0 && rect.right <= innerWidth;
                })()
                """));
            evaluate(scenario, "document.querySelector('[data-action=weather-disable]').click()");
            assertEquals("true", awaitJavascript(scenario,
                "!!document.querySelector('[data-action=weather-enable]') && !document.querySelector('.weather-options')"));
        }
    }

    private static StatusBarNotification[] awaitNotifications(NotificationManager manager, int count)
        throws InterruptedException {
        for (int i = 0; i < 30; i++) {
            var active = manager.getActiveNotifications();
            if (active.length == count) return active;
            Thread.sleep(100);
        }
        return manager.getActiveNotifications();
    }

    private static String awaitJavascript(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        String result = null;
        for (int i = 0; i < 50; i++) {
            result = evaluate(scenario, expression);
            if ("true".equals(result)) return result;
            Thread.sleep(200);
        }
        return result;
    }

    private static String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            done.countDown();
        }));
        assertTrue(done.await(5, TimeUnit.SECONDS));
        return result.get();
    }
}
