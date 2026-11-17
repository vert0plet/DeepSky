package ru.egorych.deepsky;
import org.junit.Test;
import static org.junit.Assert.*;

public class OrientationMathTest {
    final float[] identity = {1,0,0,0,1,0,0,0,1};
    @Test public void phoneFaceUpLooksDownThroughBackCamera() {
        double[][] c = OrientationMath.camera(identity, 0, 0);
        assertArrayEquals(new double[]{0,0,-1},c[0],1e-9);
        assertArrayEquals(new double[]{1,0,0},c[1],1e-9);
        assertArrayEquals(new double[]{0,1,0},c[2],1e-9);
    }
    @Test public void portraitPhoneLookingNorthHasSkyUp() {
        float[] r = {1,0,0,0,0,-1,0,1,0};
        double[][] c = OrientationMath.camera(r,0,0);
        assertArrayEquals(new double[]{0,1,0},c[0],1e-9);
        assertArrayEquals(new double[]{0,0,1},c[2],1e-9);
    }
    @Test public void landscapeRemapsScreenAxesAndKeepsPointingDirection() {
        double[][] c = OrientationMath.camera(identity,1,0);
        assertArrayEquals(new double[]{0,0,-1},c[0],1e-9);
        assertArrayEquals(new double[]{0,1,0},c[1],1e-9);
        assertArrayEquals(new double[]{-1,0,0},c[2],1e-9);
    }
    @Test public void eastDeclinationMovesMagneticNorthEastOfTrueNorth() {
        assertArrayEquals(new double[]{.5,Math.sqrt(3)/2,0},OrientationMath.trueNorth(new double[]{0,1,0},30),1e-9);
    }
    @Test public void everyDisplayRotationPreservesOrthonormalBasis() {
        for (int turn=0;turn<4;turn++) {
            double[][] c=OrientationMath.camera(identity,turn,-13.8);
            for(double[] v:c)assertEquals(1,v[0]*v[0]+v[1]*v[1]+v[2]*v[2],1e-9);
            assertEquals(0,c[0][0]*c[1][0]+c[0][1]*c[1][1]+c[0][2]*c[1][2],1e-9);
        }
    }
}
