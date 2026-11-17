package ru.egorych.deepsky;

import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.SystemClock;
import com.google.ar.core.Coordinates2d;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingFailureReason;
import com.google.ar.core.TrackingState;
import com.google.ar.core.exceptions.CameraNotAvailableException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/** Draws ARCore's live OES camera texture and publishes the display-oriented camera pose. */
final class SkyArPreview implements GLSurfaceView.Renderer {
    record Sample(SkyCameraMath.Basis basis, SkyCameraMath.Optics optics,
                  TrackingFailureReason reason, int rotation, int trackingEpoch, long receivedAt) {}

    private static final float[] QUAD = {-1, -1, 1, -1, -1, 1, 1, 1};
    private final Session session;
    private final Runnable onFailure;
    private final FloatBuffer vertices = buffer(QUAD);
    private final FloatBuffer texcoords = buffer(new float[8]);
    private final float[] uv = new float[8];
    private final float[] projection = new float[16];
    private final float[] pose = new float[16];
    private int program, texture, vertexLocation, textureLocation, width, height;
    private int drawnRotation = -1;
    private int trackingEpoch;
    private boolean tracking;
    private boolean refreshUv;
    private boolean failed;
    volatile int rotation;
    volatile Sample sample;

    SkyArPreview(Session session, Runnable onFailure) {
        this.session = session;
        this.onFailure = onFailure;
    }

    @Override public void onSurfaceCreated(GL10 unused, EGLConfig config) {
        try {
            GLES20.glClearColor(0, 0, 0, 1);
            int[] ids = new int[1];
            GLES20.glGenTextures(1, ids, 0);
            texture = ids[0];
            int target = GLES11Ext.GL_TEXTURE_EXTERNAL_OES;
            GLES20.glBindTexture(target, texture);
            GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
            GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
            GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
            GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
            int vert = shader(GLES20.GL_VERTEX_SHADER, "attribute vec2 aVertex; attribute vec2 aUv; varying vec2 vUv; "
                + "void main(){gl_Position=vec4(aVertex,0.,1.); vUv=aUv;}");
            int frag = shader(GLES20.GL_FRAGMENT_SHADER, "#extension GL_OES_EGL_image_external : require\n"
                + "precision mediump float; varying vec2 vUv; uniform samplerExternalOES uCamera; "
                + "void main(){gl_FragColor=texture2D(uCamera,vUv);}");
            program = GLES20.glCreateProgram();
            GLES20.glAttachShader(program, vert);
            GLES20.glAttachShader(program, frag);
            GLES20.glLinkProgram(program);
            GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, ids, 0);
            GLES20.glDeleteShader(vert);
            GLES20.glDeleteShader(frag);
            if (ids[0] == 0) throw new IllegalStateException("Camera shader link failed");
            vertexLocation = GLES20.glGetAttribLocation(program, "aVertex");
            textureLocation = GLES20.glGetAttribLocation(program, "aUv");
            session.setCameraTextureName(texture);
            refreshUv = true;
        } catch (RuntimeException e) {
            fail();
        }
    }

    @Override public void onSurfaceChanged(GL10 unused, int width, int height) {
        this.width = width;
        this.height = height;
        drawnRotation = -1;
        GLES20.glViewport(0, 0, width, height);
    }

    @Override public void onDrawFrame(GL10 unused) {
        if (failed || width == 0 || height == 0) return;
        try {
            int rotation = this.rotation;
            if (rotation != drawnRotation) {
                session.setDisplayGeometry(rotation, width, height);
                drawnRotation = rotation;
                refreshUv = true;
            }
            var frame = session.update();
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
            if (frame.getTimestamp() == 0) return;
            if (refreshUv || frame.hasDisplayGeometryChanged()) {
                frame.transformCoordinates2d(Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,
                    QUAD, Coordinates2d.TEXTURE_NORMALIZED, uv);
                texcoords.put(uv).position(0);
                refreshUv = false;
            }
            drawCamera();
            var camera = frame.getCamera();
            camera.getProjectionMatrix(projection, 0, .1f, 10f);
            SkyCameraMath.Basis basis = null;
            if (camera.getTrackingState() == TrackingState.TRACKING) {
                if (!tracking) trackingEpoch++;
                camera.getDisplayOrientedPose().toMatrix(pose, 0);
                basis = new SkyCameraMath.Basis(new double[]{-pose[8], -pose[9], -pose[10]},
                    new double[]{pose[0], pose[1], pose[2]}, new double[]{pose[4], pose[5], pose[6]});
            }
            tracking = basis != null;
            sample = new Sample(basis, SkyCameraMath.Optics.arCore(projection),
                camera.getTrackingFailureReason(), rotation, trackingEpoch, SystemClock.elapsedRealtime());
        } catch (CameraNotAvailableException | RuntimeException e) {
            fail();
        }
    }

    private void drawCamera() {
        GLES20.glUseProgram(program);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texture);
        GLES20.glVertexAttribPointer(vertexLocation, 2, GLES20.GL_FLOAT, false, 0, vertices);
        GLES20.glVertexAttribPointer(textureLocation, 2, GLES20.GL_FLOAT, false, 0, texcoords);
        GLES20.glEnableVertexAttribArray(vertexLocation);
        GLES20.glEnableVertexAttribArray(textureLocation);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        GLES20.glDisableVertexAttribArray(vertexLocation);
        GLES20.glDisableVertexAttribArray(textureLocation);
    }

    private void fail() {
        failed = true;
        sample = null;
        onFailure.run();
    }

    private static int shader(int kind, String source) {
        int shader = GLES20.glCreateShader(kind);
        GLES20.glShaderSource(shader, source);
        GLES20.glCompileShader(shader);
        int[] status = new int[1];
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0);
        if (status[0] == 0) throw new IllegalStateException("Camera shader compilation failed");
        return shader;
    }

    private static FloatBuffer buffer(float[] data) {
        FloatBuffer buffer = ByteBuffer.allocateDirect(data.length * Float.BYTES)
            .order(ByteOrder.nativeOrder()).asFloatBuffer();
        buffer.put(data).position(0);
        return buffer;
    }
}
