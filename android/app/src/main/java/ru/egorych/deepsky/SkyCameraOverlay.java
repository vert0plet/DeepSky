package ru.egorych.deepsky;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;

final class SkyCameraOverlay {
    enum Layer {
        FIGURES("Линии созвездий", true),
        NAMES("Названия", false),
        STARS("Точки звёзд", false),
        SOLAR("Луна и планеты", false),
        DEEP("Дипскай", false),
        DIM("Приглушить изображение", false);

        final String title;
        final boolean initial;

        Layer(String title, boolean initial) {
            this.title = title;
            this.initial = initial;
        }
    }

    private record Hit(float x, float y, SkyCameraRequest.Target target) {}

    private final SkyCameraRequest request;
    private final SharedPreferences settings;
    private final EnumSet<Layer> enabled = EnumSet.noneOf(Layer.class);
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path lines = new Path();
    private final List<RectF> labels = new ArrayList<>();
    private final List<Hit> hits = new ArrayList<>();
    private final RectF bounds = new RectF();
    private final float density;
    private final float textSize;
    private int width, height;
    private SkyCameraMath.Basis view;
    private SkyCameraMath.Optics optics;
    private double[] zenith;

    SkyCameraOverlay(Context context, SkyCameraRequest request) {
        this.request = request;
        settings = context.getSharedPreferences("sky-camera-layers", Context.MODE_PRIVATE);
        for (Layer layer : Layer.values()) {
            if (settings.getBoolean(layer.name(), layer.initial)) enabled.add(layer);
        }
        density = context.getResources().getDisplayMetrics().density;
        textSize = context.getResources().getDisplayMetrics().scaledDensity;
    }

    boolean enabled(Layer layer) { return enabled.contains(layer); }

    void set(Layer layer, boolean value) {
        if (value) enabled.add(layer);
        else enabled.remove(layer);
        settings.edit().putBoolean(layer.name(), value).apply();
    }

    void draw(Canvas canvas, int width, int height, int top, int bottom,
              SkyCameraMath.Basis camera, SkyCameraMath.Optics optics, long now, boolean calibrating,
              SkyCameraRequest.Target selected) {
        hits.clear();
        if (enabled(Layer.DIM)) canvas.drawColor(0x66000000);
        if (camera == null || optics == null || calibrating || bottom <= top) return;

        // All catalogue directions share an epoch. Rotating the camera axes back to
        // that epoch avoids advancing every constellation vertex on every frame.
        double seconds = (request.timestamp() - now) / 1000.0;
        double latitude = request.latitude();
        view = new SkyCameraMath.Basis(SkyCameraMath.advance(camera.forward(), latitude, seconds),
            SkyCameraMath.advance(camera.right(), latitude, seconds), SkyCameraMath.advance(camera.up(), latitude, seconds));
        zenith = SkyCameraMath.advance(new double[]{0, 0, 1}, latitude, seconds);
        this.optics = optics;
        this.width = width;
        this.height = height;
        bounds.set(0, top, width, bottom);
        labels.clear();
        canvas.save();
        canvas.clipRect(bounds);
        if (enabled(Layer.FIGURES)) drawFigures(canvas);
        for (SkyCameraRequest.Mark mark : request.marks()) {
            if (selected != null && selected.name().equals(mark.target().name())) continue;
            drawMark(canvas, mark);
        }
        canvas.restore();
    }

    private void drawFigures(Canvas canvas) {
        lines.rewind();
        for (var figure : request.figures()) {
            for (var line : figure.lines()) {
                for (int i = 1; i < line.size(); i++) {
                    var segment = SkyCameraMath.clipSkySegment(line.get(i - 1), line.get(i), zenith, view.forward());
                    if (segment == null) continue;
                    var a = project(segment.from());
                    var b = project(segment.to());
                    lines.moveTo(a[0], a[1]);
                    lines.lineTo(b[0], b[1]);
                }
            }
        }
        paint.setColor(request.redMode() ? 0x88d78f7b : 0x88c0dcf1);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1f);
        canvas.drawPath(lines, paint);
        if (!enabled(Layer.NAMES)) return;
        for (var figure : request.figures()) {
            float[] point = visiblePoint(figure.label().direction());
            if (point != null) label(canvas, figure.label().name(), point, 0, 12, 0xffc7e0f2);
        }
    }

    private void drawMark(Canvas canvas, SkyCameraRequest.Mark mark) {
        boolean show = switch (mark.kind()) {
            case STAR -> enabled(Layer.STARS);
            case SOLAR -> enabled(Layer.SOLAR);
            case GALAXY, DEEP -> enabled(Layer.DEEP);
        };
        boolean name = enabled(Layer.NAMES) && !mark.target().name().isEmpty()
            && (mark.kind() == SkyCameraRequest.Kind.STAR ? mark.magnitude() <= 2 : show);
        if (!show && !name) return;
        float[] point = visiblePoint(mark.target().direction());
        if (point == null) return;
        float x = point[0], y = point[1];
        if (show) {
            paint.setStrokeWidth(density);
            paint.setStyle(Paint.Style.FILL);
            switch (mark.kind()) {
                case STAR -> {
                    paint.setColor(request.redMode() ? 0xccdc927f : 0xcce8f3fc);
                    float radius = (float) Math.max(.75, 2.1 - mark.magnitude() * .3) * density;
                    canvas.drawCircle(x, y, radius, paint);
                }
                case SOLAR -> {
                    paint.setColor(request.redMode() ? 0xffd69482 : 0xffead298);
                    canvas.drawCircle(x, y, (mark.target().name().equals("Луна") ? 4 : 3) * density, paint);
                }
                case GALAXY, DEEP -> {
                    paint.setStyle(Paint.Style.STROKE);
                    paint.setColor(request.redMode() ? 0xccd69482 : 0xcce6be84);
                    if (mark.kind() == SkyCameraRequest.Kind.GALAXY) {
                        canvas.drawOval(x - 5 * density, y - 3 * density, x + 5 * density, y + 3 * density, paint);
                    } else {
                        canvas.drawRect(x - 4 * density, y - 4 * density, x + 4 * density, y + 4 * density, paint);
                    }
                }
            }
        }
        boolean labeled = name && label(canvas, mark.target().name(), point, 8 * density, 10, 0xffe0e8ef);
        if ((show || labeled) && !mark.target().name().isEmpty()) hits.add(new Hit(x, y, mark.target()));
    }

    private float[] visiblePoint(double[] direction) {
        if (SkyCameraMath.dot(direction, zenith) < 0 || SkyCameraMath.dot(direction, view.forward()) < .02) return null;
        float[] point = project(direction);
        return bounds.contains(point[0], point[1]) ? point : null;
    }

    private float[] project(double[] direction) {
        double depth = SkyCameraMath.dot(direction, view.forward());
        return new float[]{
            (float) ((optics.centerX() + optics.focalX() * SkyCameraMath.dot(direction, view.right()) / depth) * width),
            (float) ((optics.centerY() - optics.focalY() * SkyCameraMath.dot(direction, view.up()) / depth) * height)
        };
    }

    private boolean label(Canvas canvas, String name, float[] point, float offset, int size, int color) {
        if (labels.size() >= 14) return false;
        paint.setStyle(Paint.Style.FILL);
        paint.setTextSize(size * textSize);
        paint.setTextAlign(Paint.Align.CENTER);
        float x = point[0], y = point[1] - offset;
        float halfWidth = paint.measureText(name) / 2 + 4 * density;
        var box = new RectF(x - halfWidth, y - paint.getTextSize(), x + halfWidth, y + 3 * density);
        if (!bounds.contains(box)) return false;
        for (RectF other : labels) if (RectF.intersects(box, other)) return false;
        labels.add(box);
        paint.setColor(request.redMode() ? 0xffe5a091 : color);
        paint.setShadowLayer(2 * density, 0, 0, 0xff080b10);
        canvas.drawText(name, x, y, paint);
        paint.clearShadowLayer();
        return true;
    }

    SkyCameraRequest.Target pick(float x, float y) {
        Hit best = null;
        double distance = 22 * density;
        for (Hit hit : hits) {
            double candidate = Math.hypot(hit.x - x, hit.y - y);
            if (candidate < distance) {
                distance = candidate;
                best = hit;
            }
        }
        return best == null ? null : best.target;
    }
}
