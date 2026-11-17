package ru.egorych.deepsky;

import java.time.Instant;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public class WeatherForecastTest {
    private static final long HOUR = 3600;
    private final WeatherForecast.Site site = new WeatherForecast.Site(55.75, 37.62, 10800);

    @Test public void clearsTwoHoursAcrossMidnight() {
        long now = epoch("2026-11-09T09:00:00Z");
        long start = epoch("2026-11-09T20:00:00Z");
        List<WeatherForecast.Hour> hours = List.of(
            new WeatherForecast.Hour(start, 15, 0, 0),
            new WeatherForecast.Hour(start + HOUR, 20, 20, 0.1),
            new WeatherForecast.Hour(start + 2 * HOUR, 21, 0, 0)
        );
        assertEquals(new WeatherForecast.Window(start, start + 2 * HOUR), WeatherForecast.clearWindow(hours, site, now));
        assertNull(WeatherForecast.clearWindow(hours, site, start + 1));
        assertEquals(WeatherForecast.night(site, now), WeatherForecast.night(site, start + 2 * HOUR));
    }

    @Test public void rejectsPrecipitationMissingDataAndGaps() {
        long start = epoch("2026-11-09T20:00:00Z");
        WeatherForecast.Hour first = new WeatherForecast.Hour(start, 10, 0, 0);
        for (WeatherForecast.Hour next : List.of(
            new WeatherForecast.Hour(start + HOUR, 10, 21, 0),
            new WeatherForecast.Hour(start + HOUR, 10, 0, 0.11),
            new WeatherForecast.Hour(start + HOUR, Double.NaN, 0, 0),
            new WeatherForecast.Hour(start + 2 * HOUR, 10, 0, 0)
        )) {
            assertNull(WeatherForecast.clearWindow(List.of(first, next), site, start));
        }
    }

    @Test public void rejectsBrightSkyEvenWithClearForecast() {
        long start = epoch("2026-06-21T20:00:00Z");
        WeatherForecast.Site polar = new WeatherForecast.Site(72, 37.62, 10800);
        assertNull(WeatherForecast.clearWindow(List.of(new WeatherForecast.Hour(start, 0, 0, 0),
            new WeatherForecast.Hour(start + HOUR, 0, 0, 0)), polar, start));
    }

    private static long epoch(String iso) { return Instant.parse(iso).getEpochSecond(); }
}
