package ru.egorych.deepsky;

final class SkyCameraMath {
    private static final double SIDEREAL_DAY = 86164.09;

    // Axes are camera forward, right and up, expressed in east/north/up or AR space.
    record Basis(double[] forward, double[] right, double[] up) {
        static Basis of(double[][] axes) {
            return new Basis(axes[0], axes[1], axes[2]);
        }

        double[] toLocal(double[] vector) {
            return new double[]{dot(forward, vector), dot(right, vector), dot(up, vector)};
        }

        double[] fromLocal(double[] vector) {
            return new double[]{
                forward[0] * vector[0] + right[0] * vector[1] + up[0] * vector[2],
                forward[1] * vector[0] + right[1] * vector[1] + up[1] * vector[2],
                forward[2] * vector[0] + right[2] * vector[1] + up[2] * vector[2]
            };
        }
    }

    // Projection in fractions of the preview, including its crop and principal point.
    record Optics(double focalX, double focalY, double centerX, double centerY) {
        Optics scaled(double scale) {
            return new Optics(focalX * scale, focalY * scale, centerX, centerY);
        }

        static Optics arCore(float[] matrix) {
            return new Optics(matrix[0] / 2.0, matrix[5] / 2.0,
                (1 - matrix[8]) / 2.0, (1 + matrix[9]) / 2.0);
        }

        static Optics cropped(double sensorWidth, double sensorHeight, double focalMm,
                              int bufferWidth, int bufferHeight, int displayWidth, int displayHeight) {
            double sensorScale = Math.max(bufferWidth / sensorWidth, bufferHeight / sensorHeight);
            double previewScale = Math.max((double) displayWidth / bufferWidth, (double) displayHeight / bufferHeight);
            double focal = focalMm * sensorScale * previewScale;
            return new Optics(focal / displayWidth, focal / displayHeight, .5, .5);
        }
    }

    record Aim(double x, double y, double angle, boolean inFrame, boolean behind, double arrowX, double arrowY) {}

    static Aim aim(Basis view, Optics optics, double[] direction) {
        double[] local = view.toLocal(direction);
        double depth = local[0];
        double x = optics.focalX * local[1];
        double y = -optics.focalY * local[2];
        double screenX = depth > 0 ? optics.centerX + x / depth : optics.centerX;
        double screenY = depth > 0 ? optics.centerY + y / depth : optics.centerY;
        double centerAngle = Math.toDegrees(Math.acos(clamp(dot(opticalCenter(view, optics), direction))));
        return new Aim(screenX, screenY, centerAngle,
            depth > 0 && screenX >= 0 && screenX <= 1 && screenY >= 0 && screenY <= 1, depth <= 0,
            Math.abs(x) + Math.abs(y) < 1e-8 ? 1 : x, y);
    }

    record Segment(double[] from, double[] to) {}

    static Segment clipSkySegment(double[] from, double[] to, double[] zenith, double[] forward) {
        double fromAltitude = dot(from, zenith);
        double toAltitude = dot(to, zenith);
        double fromDepth = dot(from, forward) - .02;
        double toDepth = dot(to, forward) - .02;
        if (fromAltitude < 0 && toAltitude < 0 || fromDepth < 0 && toDepth < 0) return null;
        double start = 0;
        double end = 1;
        if (fromAltitude < 0) start = fromAltitude / (fromAltitude - toAltitude);
        if (toAltitude < 0) end = fromAltitude / (fromAltitude - toAltitude);
        if (fromDepth < 0) start = Math.max(start, fromDepth / (fromDepth - toDepth));
        if (toDepth < 0) end = Math.min(end, fromDepth / (fromDepth - toDepth));
        if (start > end) return null;
        return new Segment(start == 0 ? from : interpolate(from, to, start),
            end == 1 ? to : interpolate(from, to, end));
    }

    private static double[] interpolate(double[] from, double[] to, double t) {
        return new double[]{from[0] + t * (to[0] - from[0]), from[1] + t * (to[1] - from[1]),
            from[2] + t * (to[2] - from[2])};
    }

    static Basis alignAr(Basis referenceAr, Basis referenceSky, Basis currentAr) {
        return new Basis(
            referenceSky.fromLocal(referenceAr.toLocal(currentAr.forward)),
            referenceSky.fromLocal(referenceAr.toLocal(currentAr.right)),
            referenceSky.fromLocal(referenceAr.toLocal(currentAr.up))
        );
    }

    static double[] ray(Basis view, Optics optics, double x, double y) {
        return unit(view.fromLocal(new double[]{1, (x - optics.centerX) / optics.focalX,
            (optics.centerY - y) / optics.focalY}));
    }

    static double[] opticalCenter(Basis view, Optics optics) {
        return ray(view, optics, .5, .5);
    }

    static double separation(double[] from, double[] to) {
        return Math.toDegrees(Math.acos(clamp(dot(from, to))));
    }

    static final double MIN_SCALE = .65;
    static final double MAX_SCALE = 1.55;
    record PairAlignment(double scale, Rotation first, Rotation roll) {
        Basis apply(Basis basis) { return roll.apply(first.apply(basis)); }
    }

    // Both stars must be in one frame: one at the reticle and one at the tap.
    static PairAlignment alignPair(Basis view, Optics base, double x, double y, double[] first, double[] second) {
        double angle = separation(first, second);
        if (angle < 5 || angle > 32 || x < 0 || x > 1 || y < 0 || y > 1) return null;
        double low = MIN_SCALE, high = MAX_SCALE;
        var wide = base.scaled(low);
        var narrow = base.scaled(high);
        if (angle > separation(opticalCenter(view, wide), ray(view, wide, x, y))
            || angle < separation(opticalCenter(view, narrow), ray(view, narrow, x, y))) return null;
        for (int i = 0; i < 26; i++) {
            double mid = (low + high) / 2;
            var optics = base.scaled(mid);
            if (separation(opticalCenter(view, optics), ray(view, optics, x, y)) > angle) low = mid;
            else high = mid;
        }
        double scale = (low + high) / 2;
        var fitted = base.scaled(scale);
        Rotation start = Rotation.between(opticalCenter(view, fitted), first);
        double[] fittedSecond = start.apply(ray(view, fitted, x, y));
        double roll = Math.atan2(dot(first, cross(fittedSecond, second)),
            dot(fittedSecond, second) - dot(fittedSecond, first) * dot(second, first));
        return new PairAlignment(scale, start, new Rotation(first, roll));
    }

    record Rotation(double[] axis, double angle) {
        static Rotation between(double[] from, double[] to) {
            double[] axis = cross(from, to);
            double cosine = clamp(dot(from, to));
            if (dot(axis, axis) < 1e-16) {
                if (cosine >= 0) return new Rotation(new double[]{0, 0, 1}, 0);
                axis = cross(from, Math.abs(from[0]) < .8 ? new double[]{1, 0, 0} : new double[]{0, 1, 0});
            }
            return new Rotation(unit(axis), Math.acos(cosine));
        }

        double[] apply(double[] vector) { return rotate(vector, axis, angle); }

        Basis apply(Basis basis) {
            return new Basis(rotate(basis.forward, axis, angle),
                rotate(basis.right, axis, angle), rotate(basis.up, axis, angle));
        }
    }

    static double[] advance(double[] vector, double latitude, double seconds) {
        double lat = Math.toRadians(latitude);
        // The local north celestial pole is the axis; stars move westward.
        return rotate(vector, new double[]{0, Math.cos(lat), Math.sin(lat)}, -2 * Math.PI * seconds / SIDEREAL_DAY);
    }

    static double dot(double[] a, double[] b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    static double[] unit(double[] v) {
        double norm = Math.sqrt(dot(v, v));
        if (!Double.isFinite(norm) || norm < 1e-8) throw new IllegalArgumentException("Invalid direction");
        return new double[]{v[0] / norm, v[1] / norm, v[2] / norm};
    }

    private static double[] rotate(double[] vector, double[] axis, double angle) {
        double c = Math.cos(angle);
        double s = Math.sin(angle);
        double parallel = dot(axis, vector) * (1 - c);
        double[] cross = cross(axis, vector);
        return new double[]{vector[0] * c + cross[0] * s + axis[0] * parallel,
            vector[1] * c + cross[1] * s + axis[1] * parallel,
            vector[2] * c + cross[2] * s + axis[2] * parallel};
    }

    private static double[] cross(double[] a, double[] b) {
        return new double[]{a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]};
    }

    private static double clamp(double value) {
        return Math.max(-1, Math.min(1, value));
    }
}
