package com.amosley.base;

import android.animation.ValueAnimator;
import android.content.Context;
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
 * The BASE agent mascot: a soft blob with eyes and a smile that breathes and
 * blinks. Tinted with the app's accent (matcha green in dark mode, BASE red
 * in light mode).
 */
public class AgentMascotView extends View {

    private final Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint white = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint pupil = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint mouth = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint cheek = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path blob = new Path();
    private final RectF oval = new RectF();
    private final Random random = new Random();

    private int color = 0xFF6E9A3A;
    private float breath;
    private float blink;
    private ValueAnimator breathAnim;

    private final Runnable blinker = new Runnable() {
        @Override
        public void run() {
            ValueAnimator a = ValueAnimator.ofFloat(0f, 1f, 0f);
            a.setDuration(190);
            a.addUpdateListener(v -> {
                blink = (float) v.getAnimatedValue();
                invalidate();
            });
            a.start();
            postDelayed(this, 2600 + random.nextInt(3400));
        }
    };

    public AgentMascotView(Context context) {
        super(context);
        shadow.setColor(0x38000000);
        white.setColor(Color.WHITE);
        pupil.setColor(0xFF14160F);
        mouth.setColor(0xFF14160F);
        mouth.setStyle(Paint.Style.STROKE);
        mouth.setStrokeCap(Paint.Cap.ROUND);
        cheek.setColor(0x40FFFFFF);
    }

    public void setColor(int c) {
        if (color == c) return;
        color = c;
        invalidate();
    }

    public void setPressedLook(boolean pressed) {
        animate().scaleX(pressed ? 0.88f : 1f).scaleY(pressed ? 0.88f : 1f).setDuration(120).start();
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        breathAnim = ValueAnimator.ofFloat(0f, 1f);
        breathAnim.setDuration(2200);
        breathAnim.setRepeatMode(ValueAnimator.REVERSE);
        breathAnim.setRepeatCount(ValueAnimator.INFINITE);
        breathAnim.setInterpolator(new AccelerateDecelerateInterpolator());
        breathAnim.addUpdateListener(v -> {
            breath = (float) v.getAnimatedValue();
            invalidate();
        });
        breathAnim.start();
        postDelayed(blinker, 1800);
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        if (breathAnim != null) breathAnim.cancel();
        removeCallbacks(blinker);
    }

    private static int lighten(int c, float f) {
        int r = Color.red(c), g = Color.green(c), b = Color.blue(c);
        return Color.rgb(r + (int) ((255 - r) * f), g + (int) ((255 - g) * f), b + (int) ((255 - b) * f));
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight();
        float r = Math.min(w, h) * 0.40f;
        float cx = w / 2f, cy = h / 2f - h * 0.02f;

        // Ground shadow (shrinks a touch as the blob stretches up).
        float sw = r * (0.78f - 0.05f * breath);
        oval.set(cx - sw, cy + r * 0.9f, cx + sw, cy + r * 1.12f);
        c.drawOval(oval, shadow);

        c.save();
        c.scale(1f + 0.035f * breath, 1f - 0.035f * breath, cx, cy + r);

        blob.reset();
        blob.moveTo(cx, cy - r);
        blob.cubicTo(cx + r * 0.62f, cy - r, cx + r * 1.02f, cy - r * 0.45f, cx + r, cy + r * 0.12f);
        blob.cubicTo(cx + r * 0.98f, cy + r * 0.72f, cx + r * 0.55f, cy + r * 0.98f, cx, cy + r * 0.98f);
        blob.cubicTo(cx - r * 0.55f, cy + r * 0.98f, cx - r * 0.98f, cy + r * 0.72f, cx - r, cy + r * 0.12f);
        blob.cubicTo(cx - r * 1.02f, cy - r * 0.45f, cx - r * 0.62f, cy - r, cx, cy - r);
        body.setShader(new RadialGradient(cx - r * 0.35f, cy - r * 0.5f, r * 1.7f,
            lighten(color, 0.3f), color, Shader.TileMode.CLAMP));
        c.drawPath(blob, body);

        // Eyes
        float ey = cy - r * 0.08f, ex = r * 0.33f;
        float ew = r * 0.16f, eh = r * 0.22f * (1f - 0.88f * blink);
        for (int s = -1; s <= 1; s += 2) {
            float x = cx + s * ex;
            oval.set(x - ew, ey - eh, x + ew, ey + eh);
            c.drawOval(oval, white);
            if (blink < 0.55f) {
                c.drawCircle(x + r * 0.03f, ey + r * 0.04f, r * 0.095f, pupil);
                c.drawCircle(x + r * 0.065f, ey - r * 0.01f, r * 0.032f, white);
            }
        }

        // Cheeks + smile
        c.drawCircle(cx - r * 0.58f, cy + r * 0.24f, r * 0.11f, cheek);
        c.drawCircle(cx + r * 0.58f, cy + r * 0.24f, r * 0.11f, cheek);
        mouth.setStrokeWidth(r * 0.075f);
        oval.set(cx - r * 0.2f, cy + r * 0.1f, cx + r * 0.2f, cy + r * 0.42f);
        c.drawArc(oval, 25, 130, false, mouth);

        c.restore();
    }
}
