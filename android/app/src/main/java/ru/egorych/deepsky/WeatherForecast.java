package ru.egorych.deepsky;

import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

final class WeatherForecast {
    static final long HOUR = 3600;
    static final long DAY = 24 * HOUR;
    private static final double RAD = Math.PI / 180;

    record Site(double latitude, double longitude, int offsetSeconds) {
        static Site create(Double latitude, Double longitude, Integer offsetSeconds) {
            if (latitude == null || longitude == null || offsetSeconds == null
                || !Double.isFinite(latitude) || Math.abs(latitude) > 90
                || !Double.isFinite(longitude) || Math.abs(longitude) > 180
                || offsetSeconds < -12 * HOUR || offsetSeconds > 14 * HOUR) return null;
            return new Site(Math.round(latitude * 100) / 100.0,
                Math.round(longitude * 100) / 100.0, offsetSeconds);
        }
    }

    record Hour(long start, double cloud, double rainChance, double rain) {
        boolean clear() {
            return cloud >= 0 && cloud <= 20 && rainChance >= 0 && rainChance <= 20
                && rain >= 0 && rain <= 0.1;
        }
    }

    record Window(long start, long end) {
        long length() { return end - start; }
    }

    static long night(Site site, long now) {
        return Math.floorDiv(now + site.offsetSeconds - 6 * HOUR, DAY);
    }

    static Window clearWindow(List<Hour> hours, Site site, long now) {
        long noon = night(site, now) * DAY + 12 * HOUR - site.offsetSeconds;
        Window best = null;
        Window run = null;
        for (Hour hour : hours) {
            long start = hour.start;
            long end = start + HOUR;
            if (start < Math.max(now, noon) || end > noon + DAY
                || !hour.clear() || sunAltitude(start, site) > -12 || sunAltitude(end, site) > -12) {
                run = null;
                continue;
            }
            run = new Window(run != null && run.end == start ? run.start : start, end);
            if (run.length() >= 2 * HOUR && (best == null || run.length() > best.length())) best = run;
        }
        return best;
    }

    // Same NOAA fractional-year approximation as the foreground forecast.
    private static double sunAltitude(long timestamp, Site site) {
        Calendar utc = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        utc.setTimeInMillis(timestamp * 1000);
        double day = utc.get(Calendar.DAY_OF_YEAR) - 1 + Math.floorMod(timestamp, DAY) / (double) DAY;
        double g = 2 * Math.PI / utc.getActualMaximum(Calendar.DAY_OF_YEAR) * (day - 0.5);
        double timeCorrection = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
            - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
        double dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
            - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
            - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
        double hourAngle = (Math.floorMod(timestamp, DAY) / 240.0
            + timeCorrection / 4 + site.longitude - 180) * RAD;
        double lat = site.latitude * RAD;
        return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)) / RAD;
    }
}
