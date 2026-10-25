package com.amosley.base;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;
import java.util.Random;

/**
 * Rojo, small: a red felt fuzzball with round glasses and glossy googly eyes.
 * Drawn in a 400×400 design box (same layout as rojo-face.js) and scaled to the view.
 * Breathes, blinks, looks around a little, and has "focused" (half-lidded) and
 * "surprised" (big eyes + hop) looks for focus sessions and nudges.
 */
public class AgentMascotView extends View {

    public static final int ROJO_RED = 0xFFF2481D;

    private final Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint felt = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint eye = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint white = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint frame = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint shine = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint lidLine = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path blob = new Path();
    private final RectF oval = new RectF();
    private final Random random = new Random();

    private float breath, blink, look, hop;
    private float lid;          // 0 open … 1 shut (resting lid for moods)
    private float pupil = 1f;
    private String mood = "idle";
    private ValueAnimator breathAnim;
    private Shader bodyShader, eyeShader;
    private int shaderSize = -1;

    private static final float[] LENS_X = { 126f, 274f };
    private static final float LENS_Y = 176f, LRX = 62f, LRY = 77f, ER = 35f;

    private final Runnable blinker = new Runnable() {
        @Override
        public void run() {
            ValueAnimator a = ValueAnimator.ofFloat(0f, 1f, 0f);
            a.setDuration(180);
            a.addUpdateListener(v -> { blink = (float) v.getAnimatedValue(); invalidate(); });
            a.start();
            postDelayed(this, 2400 + random.nextInt(3600));
        }
    };
    private final Runnable glancer = new Runnable() {
        @Override
        public void run() {
            float to = "focused".equals(mood) ? 0f : (random.nextFloat() * 2f - 1f) * 0.8f;
            ValueAnimator a = ValueAnimator.ofFloat(look, to);
            a.setDuration(260);
            a.addUpdateListener(v -> { look = (float) v.getAnimatedValue(); invalidate(); });
            a.start();
            postDelayed(this, 1600 + random.nextInt(2600));
        }
    };

    public AgentMascotView(Context context) {
        super(context);
        shadow.setColor(0x33000000);
        white.setColor(Color.WHITE);
        frame.setColor(0xFF0C0C0C);
        frame.setStyle(Paint.Style.STROKE);
        frame.setStrokeCap(Paint.Cap.ROUND);
        shine.setColor(0x38FFFFFF);
        shine.setStyle(Paint.Style.STROKE);
        shine.setStrokeCap(Paint.Cap.ROUND);
        lidLine.setColor(0xFF8F2408);
        lidLine.setStyle(Paint.Style.STROKE);
        lidLine.setStrokeCap(Paint.Cap.ROUND);
        felt.setShader(new BitmapShader(noise(), Shader.TileMode.REPEAT, Shader.TileMode.REPEAT));
    }

    /** Kept for compatibility: Rojo is always red. */
    public void setColor(int c) {}

    public void setMood(String m) {
        if (m == null) m = "idle";
        if (m.equals(mood)) return;
        mood = m;
        float toLid = "focused".equals(m) ? 0.22f : 0f;
        float toPupil = "surprised".equals(m) ? 1.18f : 1f;
        ValueAnimator a = ValueAnimator.ofFloat(0f, 1f);
        final float l0 = lid, p0 = pupil;
        a.setDuration(220);
        a.addUpdateListener(v -> {
            float t = (float) v.getAnimatedValue();
            lid = l0 + (toLid - l0) * t;
            pupil = p0 + (toPupil - p0) * t;
            invalidate();
        });
        a.start();
        if ("surprised".equals(m)) hop();
    }

    public void hop() {
        ValueAnimator a = ValueAnimator.ofFloat(0f, 1f, 0f);
        a.setDuration(380);
        a.addUpdateListener(v -> { hop = (float) v.getAnimatedValue(); invalidate(); });
        a.start();
    }

    public void setPressedLook(boolean pressed) {
        animate().scaleX(pressed ? 0.88f : 1f).scaleY(pressed ? 0.88f : 1f).setDuration(120).start();
    }

    private static Bitmap noise() {
        Random r = new Random(7);
        int n = 64;
        Bitmap b = Bitmap.createBitmap(n, n, Bitmap.Config.ARGB_8888);
        for (int y = 0; y < n; y++) {
            for (int x = 0; x < n; x++) {
                int v = r.nextInt(100);
                int c = v < 18 ? Color.argb(46, 255, 214, 190) : v > 84 ? Color.argb(40, 110, 20, 4) : Color.TRANSPARENT;
                b.setPixel(x, y, c);
            }
        }
        return b;
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        breathAnim = ValueAnimator.ofFloat(0f, 1f);
        breathAnim.setDuration(2300);
        breathAnim.setRepeatMode(ValueAnimator.REVERSE);
        breathAnim.setRepeatCount(ValueAnimator.INFINITE);
        breathAnim.setInterpolator(new AccelerateDecelerateInterpolator());
        breathAnim.addUpdateListener(v -> { breath = (float) v.getAnimatedValue(); invalidate(); });
        breathAnim.start();
        postDelayed(blinker, 1500);
        postDelayed(glancer, 900);
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        if (breathAnim != null) breathAnim.cancel();
        removeCallbacks(blinker);
        removeCallbacks(glancer);
    }

    private void ensureShaders(float s) {
        int size = Math.round(s * 1000);
        if (size == shaderSize) return;
        shaderSize = size;
        bodyShader = new RadialGradient(150 * s, 120 * s, 300 * s,
            new int[] { 0xFFFF5E2E, ROJO_RED, 0xFFD23A16 }, new float[] { 0f, 0.6f, 1f }, Shader.TileMode.CLAMP);
        eyeShader = new RadialGradient(-10 * s, -12 * s, ER * 1.6f * s,
            new int[] { 0xFF4A4A4A, 0xFF111111, 0xFF000000 }, new float[] { 0f, 0.45f, 1f }, Shader.TileMode.CLAMP);
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight();
        float s = Math.min(w, h) / 400f;
        float ox = (w - 400 * s) / 2f, oy = (h - 400 * s) / 2f;
        ensureShaders(s);

        // ground shadow
        oval.set(ox + 110 * s, oy + 372 * s, ox + 290 * s, oy + 394 * s);
        c.drawOval(oval, shadow);

        c.save();
        c.translate(ox, oy - hop * 22 * s);
        float sq = 0.025f * breath;
        c.scale(1f + sq, 1f - sq, 200 * s, 370 * s);

        // body: a circle plus twelve bumps
        blob.reset();
        blob.addCircle(200 * s, 208 * s, 160 * s, Path.Direction.CW);
        for (int i = 0; i < 12; i++) {
            double a = i / 12.0 * Math.PI * 2 + Math.PI / 12;
            blob.addCircle((float) (200 + Math.cos(a) * 140) * s, (float) (208 + Math.sin(a) * 140) * s, 56 * s, Path.Direction.CW);
        }
        blob.setFillType(Path.FillType.WINDING);
        body.setShader(bodyShader);
        c.drawPath(blob, body);
        c.save();
        c.clipPath(blob);
        c.drawPaint(felt);
        c.restore();

        // eyes behind the glasses
        float closed = Math.max(lid, blink);
        float gx = look * 14f;
        for (int i = 0; i < 2; i++) {
            float inward = i == 0 ? 12f : -12f;
            float ex = (LENS_X[i] + gx + inward) * s, ey = (LENS_Y + 4 + ("focused".equals(mood) ? 16 : 0)) * s;
            float r = ER * pupil * s;
            c.save();
            c.translate(ex, ey);
            if (closed > 0.88f) {
                lidLine.setColor(0xFF111111);
                lidLine.setStrokeWidth(6 * s);
                oval.set(-r * 0.75f, -r * 0.3f, r * 0.75f, r * 0.6f);
                c.drawArc(oval, 20, 140, false, lidLine);
            } else {
                c.save();
                float top = -r + 2 * r * closed;
                c.clipRect(-r - 2, top, r + 2, r + 2);
                eye.setShader(eyeShader);
                c.drawCircle(0, 0, r, eye);
                c.drawCircle(11 * s * pupil, -12 * s * pupil, 9.5f * s * pupil, white);
                c.restore();
                if (closed > 0.12f) {
                    float yy = top + 3 * s;
                    float hw = (float) Math.sqrt(Math.max(0, r * r - yy * yy)) + 2 * s;
                    lidLine.setColor(0xFF8F2408);
                    lidLine.setStrokeWidth(4.5f * s);
                    c.drawLine(-hw, yy, hw, yy, lidLine);
                }
            }
            c.restore();
        }

        // glasses
        frame.setStrokeWidth(8 * s);
        for (int i = 0; i < 2; i++) {
            oval.set((LENS_X[i] - LRX) * s, (LENS_Y - LRY) * s, (LENS_X[i] + LRX) * s, (LENS_Y + LRY) * s);
            c.drawOval(oval, frame);
        }
        frame.setStrokeWidth(9 * s);
        c.drawLine((LENS_X[0] + LRX - 1) * s, (LENS_Y - 6) * s, (LENS_X[1] - LRX + 1) * s, (LENS_Y - 6) * s, frame);
        frame.setStrokeWidth(8 * s);
        c.drawLine((LENS_X[0] - LRX) * s, LENS_Y * s, 44 * s, LENS_Y * s, frame);
        c.drawLine((LENS_X[1] + LRX) * s, LENS_Y * s, 356 * s, LENS_Y * s, frame);
        shine.setStrokeWidth(2.4f * s);
        for (int i = 0; i < 2; i++) {
            oval.set((LENS_X[i] - LRX * 0.8f) * s, (LENS_Y - LRY * 0.92f) * s, (LENS_X[i] + LRX * 0.6f) * s, (LENS_Y + LRY * 0.4f) * s);
            c.drawArc(oval, 200, 60, false, shine);
        }
        c.restore();
    }
}
