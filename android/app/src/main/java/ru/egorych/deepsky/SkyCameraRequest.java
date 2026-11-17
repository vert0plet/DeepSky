package ru.egorych.deepsky;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

record SkyCameraRequest(double latitude, double longitude, long timestamp,
                        boolean redMode, Target target, List<Target> stars,
                        List<Mark> marks, List<Figure> figures) {
    record Target(String name, double[] direction) {}
    enum Kind { STAR, SOLAR, GALAXY, DEEP }
    record Mark(Kind kind, Target target, double magnitude) {}
    record Figure(Target label, List<List<double[]>> lines) {}

    static SkyCameraRequest parse(JSONObject data) throws JSONException {
        double latitude = data.getDouble("latitude");
        double longitude = data.getDouble("longitude");
        long timestamp = data.getLong("timestamp");
        if (!Double.isFinite(latitude) || Math.abs(latitude) > 90
            || !Double.isFinite(longitude) || Math.abs(longitude) > 180 || timestamp <= 0) {
            throw new JSONException("Invalid observer");
        }
        Target target = data.isNull("target") ? null : parseTarget(data.getJSONObject("target"));
        JSONArray list = data.getJSONArray("stars");
        List<Target> stars = new ArrayList<>();
        for (int i = 0; i < Math.min(40, list.length()); i++) {
            stars.add(parseTarget(list.getJSONObject(i)));
        }
        return new SkyCameraRequest(latitude, longitude, timestamp, data.optBoolean("redMode"), target, stars,
            parseMarks(data.getJSONArray("marks")), parseFigures(data.getJSONArray("figures")));
    }

    private static List<Mark> parseMarks(JSONArray array) throws JSONException {
        if (array.length() > 1600) throw new JSONException("Too many camera markers");
        List<Mark> result = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            JSONArray item = array.getJSONArray(i);
            Kind kind = Kind.valueOf(item.getString(0).toUpperCase(Locale.ROOT));
            String name = item.getString(1);
            double magnitude = item.getDouble(3);
            if (name.length() > 120 || !Double.isFinite(magnitude)) throw new JSONException("Invalid marker");
            result.add(new Mark(kind, new Target(name, vector(item.getJSONArray(2))), magnitude));
        }
        return result;
    }

    private static List<Figure> parseFigures(JSONArray array) throws JSONException {
        if (array.length() > 100) throw new JSONException("Too many constellations");
        List<Figure> result = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            JSONArray item = array.getJSONArray(i);
            Target label = new Target(item.getString(0), vector(item.getJSONArray(1)));
            List<List<double[]>> lines = new ArrayList<>();
            JSONArray paths = item.getJSONArray(2);
            for (int j = 0; j < paths.length(); j++) {
                List<double[]> line = new ArrayList<>();
                JSONArray points = paths.getJSONArray(j);
                for (int k = 0; k < points.length(); k++) line.add(vector(points.getJSONArray(k)));
                lines.add(line);
            }
            result.add(new Figure(label, lines));
        }
        return result;
    }

    private static Target parseTarget(JSONObject data) throws JSONException {
        String name = data.getString("name").trim();
        if (name.isEmpty() || name.length() > 120) throw new JSONException("Invalid target");
        return new Target(name, vector(data.getJSONArray("direction")));
    }

    private static double[] vector(JSONArray direction) throws JSONException {
        if (direction.length() != 3) throw new JSONException("Invalid direction");
        return SkyCameraMath.unit(new double[]{direction.getDouble(0), direction.getDouble(1), direction.getDouble(2)});
    }

    double[] direction(Target object, long now) {
        return SkyCameraMath.advance(object.direction, latitude, (now - timestamp) / 1000.0);
    }
}
