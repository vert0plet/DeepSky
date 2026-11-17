package ru.egorych.deepsky;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

final class WeatherAlerts {
    private static final String CHANNEL = "observing-weather";
    private static final String PERIODIC = "observing-weather-periodic";
    private static final String IMMEDIATE = "observing-weather-immediate";
    private static final int NOTIFICATION = 5201;
    private static final long INTERVAL_HOURS = 3;

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("observing-weather", Context.MODE_PRIVATE);
    }

    static synchronized WeatherForecast.Site site(Context context) {
        SharedPreferences prefs = preferences(context);
        if (!prefs.contains("latitude")) return null;
        return WeatherForecast.Site.create(
            (double) prefs.getInt("latitude", 0) / 100, (double) prefs.getInt("longitude", 0) / 100,
            prefs.getInt("offsetSeconds", 0)
        );
    }

    static boolean allowed(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
            Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = context.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
        return true;
    }

    static synchronized void configure(Context context, WeatherForecast.Site site, boolean enable) {
        WeatherForecast.Site previous = site(context);
        if (site == null || (previous == null && !enable)) return;
        boolean changed = !site.equals(previous);
        if (changed) {
            preferences(context).edit()
                .putInt("latitude", (int) Math.round(site.latitude() * 100))
                .putInt("longitude", (int) Math.round(site.longitude() * 100))
                .putInt("offsetSeconds", site.offsetSeconds())
                .apply();
            NotificationManagerCompat.from(context).cancel(NOTIFICATION);
        }
        WorkManager manager = WorkManager.getInstance(context);
        Constraints network = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        manager.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(WeatherWorker.class, INTERVAL_HOURS, TimeUnit.HOURS)
                .setInitialDelay(INTERVAL_HOURS, TimeUnit.HOURS).setConstraints(network).build());
        if (changed || enable) {
            manager.enqueueUniqueWork(IMMEDIATE, ExistingWorkPolicy.REPLACE,
                new OneTimeWorkRequest.Builder(WeatherWorker.class).setConstraints(network).build());
        }
    }

    static synchronized void disable(Context context) {
        if (site(context) == null) return;
        preferences(context).edit().remove("latitude").remove("longitude").remove("offsetSeconds").apply();
        WorkManager manager = WorkManager.getInstance(context);
        manager.cancelUniqueWork(PERIODIC);
        manager.cancelUniqueWork(IMMEDIATE);
        NotificationManagerCompat.from(context).cancel(NOTIFICATION);
    }

    static boolean shouldCheck(Context context, WeatherForecast.Site site, long now) {
        long localHour = Math.floorMod(now + site.offsetSeconds(), WeatherForecast.DAY) / WeatherForecast.HOUR;
        return localHour >= 8 && localHour < 23 && allowed(context)
            && preferences(context).getLong("lastNotified", Long.MIN_VALUE) != WeatherForecast.night(site, now);
    }

    static synchronized void notifyClearWindow(Context context, WeatherForecast.Site site,
                                               WeatherForecast.Window window, long now) {
        if (window == null || window.start() < now || !site.equals(site(context))
            || !shouldCheck(context, site, now)) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Погода для наблюдений",
                NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Когда прогноз обещает ясное окно для наблюдений");
            context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("deepsky://weather/tonight"),
            context, MainActivity.class);
        PendingIntent open = PendingIntent.getActivity(context, NOTIFICATION, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        SimpleDateFormat time = new SimpleDateFormat("HH:mm", Locale.ROOT);
        time.setTimeZone(TimeZone.getTimeZone("UTC"));
        long offset = site.offsetSeconds();
        String hours = time.format(new Date((window.start() + offset) * 1000)) + "–"
            + time.format(new Date((window.end() + offset) * 1000));
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_weather_notification)
            .setContentTitle("Ожидается ясное небо")
            .setContentText("Ясное окно " + hours + " по времени площадки")
            .setContentIntent(open)
            .setAutoCancel(true);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
            Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManagerCompat.from(context).notify(NOTIFICATION, notification.build());
        preferences(context).edit().putLong("lastNotified", WeatherForecast.night(site, now)).apply();
    }
}
