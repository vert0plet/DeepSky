package ru.egorych.deepsky;

import org.junit.Test;
import static org.junit.Assert.*;

public class SkyCameraMathTest {
    private static final double EPS = 1e-8;
    private static final double[] NORTH = {0, 1, 0};
    private static final double[] EAST = {1, 0, 0};
    private static final double[] UP = {0, 0, 1};
    private static final SkyCameraMath.Basis VIEW = new SkyCameraMath.Basis(NORTH, EAST, UP);

    @Test public void projectsCameraCropAndKeepsBehindCameraOffscreen() {
        var optics = new SkyCameraMath.Optics(1, 1, .4, .6);
        var center = SkyCameraMath.aim(VIEW, optics, NORTH);
        assertTrue(center.inFrame());
        assertEquals(.4, center.x(), EPS);
        assertEquals(.6, center.y(), EPS);

        var behind = SkyCameraMath.aim(VIEW, optics, SkyCameraMath.unit(new double[]{-1, -1, 0}));
        assertFalse(behind.inFrame());
        assertTrue(behind.behind());
        assertTrue(behind.arrowX() < 0);
        var screenCenter = SkyCameraMath.aim(VIEW, optics, SkyCameraMath.opticalCenter(VIEW, optics));
        assertEquals(.5, screenCenter.x(), EPS);
        assertEquals(.5, screenCenter.y(), EPS);
        assertEquals(0, screenCenter.angle(), 1e-5);
    }

    @Test public void clipsConstellationLinesAtHorizonAndBehindCamera() {
        var from = new double[]{1, -1, 1};
        var to = new double[]{1, 3, -1};
        var clipped = SkyCameraMath.clipSkySegment(from, to, UP, NORTH);
        assertNotNull(clipped);
        assertEquals(.02, clipped.from()[1], EPS);
        assertEquals(0, clipped.to()[2], EPS);
        assertNull(SkyCameraMath.clipSkySegment(new double[]{1, 2, -3}, new double[]{1, -3, 1}, UP, NORTH));
    }

    @Test public void preservesArRelativeYawAndDisplayRoll() {
        var arAtStart = new SkyCameraMath.Basis(new double[]{0, 0, -1}, EAST, NORTH);
        var arTurn = new SkyCameraMath.Basis(EAST, new double[]{0, 0, 1}, NORTH);
        var aligned = SkyCameraMath.alignAr(arAtStart, VIEW, arTurn);
        assertArrayEquals(EAST, aligned.forward(), EPS);
        assertArrayEquals(new double[]{0, -1, 0}, aligned.right(), EPS);
        assertArrayEquals(UP, aligned.up(), EPS);
        var rolled = new SkyCameraMath.Basis(arAtStart.forward(), arAtStart.up(), new double[]{-1, 0, 0});
        assertArrayEquals(UP, SkyCameraMath.alignAr(arAtStart, VIEW, rolled).right(), EPS);
    }

    @Test public void correctsThePointingAtAKnownStar() {
        var correction = SkyCameraMath.Rotation.between(NORTH, EAST);
        assertArrayEquals(EAST, correction.apply(VIEW).forward(), EPS);
        assertArrayEquals(UP, correction.apply(VIEW).up(), EPS);
        var opposite = new double[]{0, -1, 0};
        assertArrayEquals(opposite, SkyCameraMath.Rotation.between(NORTH, opposite).apply(VIEW).forward(), EPS);
    }

    @Test public void recoversScaleAndOrientationFromAStarPair() {
        var intrinsic = new SkyCameraMath.Optics(.9, 1.1, .46, .55);
        var actual = intrinsic.scaled(1.23);
        var yaw = SkyCameraMath.Rotation.between(NORTH, SkyCameraMath.unit(new double[]{.15, 1, .25}));
        var rolledView = new SkyCameraMath.Rotation(yaw.apply(NORTH), .19).apply(yaw.apply(VIEW));
        double[] first = SkyCameraMath.opticalCenter(rolledView, actual);
        double[] second = SkyCameraMath.ray(rolledView, actual, .78, .38);
        var result = SkyCameraMath.alignPair(VIEW, intrinsic, .78, .38, first, second);
        assertNotNull(result);
        assertEquals(1.23, result.scale(), 1e-7);
        var aligned = result.apply(VIEW);
        var optic = intrinsic.scaled(result.scale());
        var center = SkyCameraMath.aim(aligned, optic, first);
        assertEquals(.5, center.x(), 1e-7);
        assertEquals(.5, center.y(), 1e-7);
        var offset = SkyCameraMath.aim(aligned, optic, second);
        assertEquals(.78, offset.x(), 1e-7);
        assertEquals(.38, offset.y(), 1e-7);
        assertArrayEquals(rolledView.up(), aligned.up(), 1e-7);
    }

    @Test public void rejectsCoincidentStarsAndUnplausibleTaps() {
        var optics = new SkyCameraMath.Optics(1, 1, .5, .5);
        var second = SkyCameraMath.ray(VIEW, optics, .73, .42);
        assertNull(SkyCameraMath.alignPair(VIEW, optics, .73, .42, NORTH, NORTH));
        assertNull(SkyCameraMath.alignPair(VIEW, optics, .5, .5, NORTH, second));
        assertNull(SkyCameraMath.alignPair(VIEW, optics, 1.1, .42, NORTH, second));
    }

    @Test public void rotatesSkyWestWithEarthRotation() {
        assertArrayEquals(new double[]{-1, 0, 0}, SkyCameraMath.advance(UP, 0, 86164.09 / 4), EPS);
        assertArrayEquals(UP, SkyCameraMath.advance(UP, 90, 900), EPS);
    }
}
