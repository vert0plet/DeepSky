package ru.egorych.deepsky;

import android.content.Context;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class WeatherWorker extends Worker {
    public WeatherWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext();
        WeatherForecast.Site site = WeatherAlerts.site(context);
        if (site == null || !WeatherAlerts.shouldCheck(context, site, System.currentTimeMillis() / 1000)) {
            return Result.success();
        }
        try {
            List<WeatherForecast.Hour> hours = fetch(site);
            long now = System.currentTimeMillis() / 1000;
            if (!isStopped()) WeatherAlerts.notifyClearWindow(context, site,
                WeatherForecast.clearWindow(hours, site, now), now);
            return Result.success();
        } catch (IOException | JSONException error) {
            return getRunAttemptCount() < 2 ? Result.retry() : Result.failure();
        }
    }

    private List<WeatherForecast.Hour> fetch(WeatherForecast.Site site) throws IOException, JSONException {
        Uri url = Uri.parse("https://api.open-meteo.com/v1/forecast").buildUpon()
            .appendQueryParameter("latitude", Double.toString(site.latitude()))
            .appendQueryParameter("longitude", Double.toString(site.longitude()))
            .appendQueryParameter("hourly", "cloud_cover,precipitation_probability,precipitation")
            .appendQueryParameter("timeformat", "unixtime")
            .appendQueryParameter("timezone", "GMT")
            .appendQueryParameter("forecast_days", "3").build();
        HttpURLConnection connection = (HttpURLConnection) new URL(url.toString()).openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setInstanceFollowRedirects(false);
        try {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IOException("Forecast unavailable");
            StringBuilder data = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                connection.getInputStream(), StandardCharsets.UTF_8))) {
                char[] buffer = new char[4096];
                int count;
                while ((count = reader.read(buffer)) != -1) {
                    if (data.length() + count > 128 * 1024) throw new IOException("Forecast too large");
                    data.append(buffer, 0, count);
                }
            }
            return parse(new JSONObject(data.toString()).getJSONObject("hourly"));
        } finally {
            connection.disconnect();
        }
    }

    private static List<WeatherForecast.Hour> parse(JSONObject hourly) throws JSONException {
        JSONArray time = hourly.getJSONArray("time");
        JSONArray cloud = hourly.getJSONArray("cloud_cover");
        JSONArray rainChance = hourly.getJSONArray("precipitation_probability");
        JSONArray rain = hourly.getJSONArray("precipitation");
        List<WeatherForecast.Hour> hours = new ArrayList<>();
        for (int i = 0; i + 1 < Math.min(time.length(), 96); i++) {
            long start = time.getLong(i);
            if (time.getLong(i + 1) != start + WeatherForecast.HOUR) continue;
            // Open-Meteo reports precipitation for the previous hour.
            hours.add(new WeatherForecast.Hour(start, cloud.optDouble(i), rainChance.optDouble(i + 1), rain.optDouble(i + 1)));
        }
        return hours;
    }
}
