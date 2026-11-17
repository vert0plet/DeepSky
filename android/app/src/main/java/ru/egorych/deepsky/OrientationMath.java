package ru.egorych.deepsky;

/** Android's sensor matrix maps device axes to magnetic east/north/up. */
public final class OrientationMath {
    private OrientationMath() {}
    public static double[][] camera(float[] matrix, int quarterTurns, double declinationDegrees) {
        double[] x = {matrix[0], matrix[3], matrix[6]};
        double[] y = {matrix[1], matrix[4], matrix[7]};
        double[] forward = {-matrix[2], -matrix[5], -matrix[8]};
        double[] right, up;
        switch ((quarterTurns % 4 + 4) % 4) {
            case 1: right = y; up = negative(x); break;
            case 2: right = negative(x); up = negative(y); break;
            case 3: right = negative(y); up = x; break;
            default: right = x; up = y;
        }
        return new double[][]{trueNorth(forward, declinationDegrees), trueNorth(right, declinationDegrees), trueNorth(up, declinationDegrees)};
    }
    static double[] negative(double[] vector) { return new double[]{-vector[0], -vector[1], -vector[2]}; }
    static double[] trueNorth(double[] v, double angle) {
        double r = Math.toRadians(angle), c = Math.cos(r), s = Math.sin(r);
        return new double[]{v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]};
    }
}
