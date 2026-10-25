package com.amosley.base;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;
import android.view.animation.DecelerateInterpolator;

/**
 * Full-screen, touch-through layer shown while Rojo is using the phone:
 * a glowing Rojo-red border around the screen, and his pointer, which
 * flies (with a little comet trail) to whatever he's about to tap.
 */
public class RojoControlOverlay extends View {

    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint edge = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint trail = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ripple = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rect = new RectF();
    private final float density;

    private float pulse;
    private float px = -1, py = -1;          // pointer position (-1 = hidden)
    private final float[] tx = new float[8], ty = new float[8];
    private float rippleT = -1;
    private ValueAnimator pulseAnim;

    public RojoControlOverlay(Context c) {
        super(c);
        density = c.getResources().getDisplayMetrics().density;
        setLayerType(LAYER_TYPE_SOFTWARE, null);   // BlurMaskFilter needs software
        glow.setStyle(Paint.Style.STROKE);
        glow.setColor(AgentMascotView.ROJO_RED);
        glow.setMaskFilter(new BlurMaskFilter(14 * density, BlurMaskFilter.Blur.NORMAL));
        edge.setStyle(Paint.Style.STROKE);
        edge.setColor(AgentMascotView.ROJO_RED);
        dot.setColor(AgentMascotView.ROJO_RED);
        ring.setStyle(Paint.Style.STROKE);
        ring.setColor(0xFFFFFFFF);
        ring.setStrokeWidth(3 * density);
        trail.setColor(AgentMascotView.ROJO_RED);
        ripple.setStyle(Paint.Style.STROKE);
        ripple.setColor(AgentMascotView.ROJO_RED);
        java.util.Arrays.fill(tx, -1);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        pulseAnim = ValueAnimator.ofFloat(0f, 1f);
        pulseAnim.setDuration(1400);
        pulseAnim.setRepeatMode(ValueAnimator.REVERSE);
        pulseAnim.setRepeatCount(ValueAnimator.INFINITE);
        pulseAnim.addUpdateListener(a -> { pulse = (float) a.getAnimatedValue(); invalidate(); });
        pulseAnim.start();
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        if (pulseAnim != null) pulseAnim.cancel();
    }

    /** Fly the pointer to (x, y) in screen pixels, then run onArrive. */
    public void moveTo(float x, float y, Runnable onArrive) {
        int[] loc = new int[2];
        getLocationOnScreen(loc);
        final float toX = x - loc[0], toY = y - loc[1];
        final float fromX = px < 0 ? getWidth() / 2f : px, fromY = py < 0 ? getHeight() * 0.85f : py;
        ValueAnimator a = ValueAnimator.ofFloat(0f, 1f);
        a.setDuration(520);
        a.setInterpolator(new DecelerateInterpolator(1.6f));
        a.addUpdateListener(v -> {
            float t = (float) v.getAnimatedValue();
            // a gentle arc
            float ax = fromX + (toX - fromX) * t;
            float ay = fromY + (toY - fromY) * t - (float) Math.sin(Math.PI * t) * 60 * density;
            for (int i = tx.length - 1; i > 0; i--) { tx[i] = tx[i - 1]; ty[i] = ty[i - 1]; }
            tx[0] = px; ty[0] = py;
            px = ax; py = ay;
            invalidate();
        });
        a.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(android.animation.Animator animation) {
                java.util.Arrays.fill(tx, -1);
                if (onArrive != null) onArrive.run();
            }
        });
        a.start();
    }

    /** A little ring where Rojo just tapped. */
    public void tapRipple() {
        ValueAnimator a = ValueAnimator.ofFloat(0f, 1f);
        a.setDuration(420);
        a.addUpdateListener(v -> { rippleT = (float) v.getAnimatedValue(); invalidate(); });
        a.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(android.animation.Animator animation) { rippleT = -1; invalidate(); }
        });
        a.start();
    }

    public void hidePointer() { px = py = -1; java.util.Arrays.fill(tx, -1); invalidate(); }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight();
        float inset = 3 * density;
        float r = 34 * density;    // roughly the phone's screen corner radius
        rect.set(inset, inset, w - inset, h - inset);
        glow.setStrokeWidth((10 + 6 * pulse) * density);
        glow.setAlpha((int) (150 + 80 * pulse));
        c.drawRoundRect(rect, r, r, glow);
        edge.setStrokeWidth(3 * density);
        edge.setAlpha(230);
        c.drawRoundRect(rect, r, r, edge);

        if (px >= 0) {
            for (int i = 0; i < tx.length; i++) {
                if (tx[i] < 0) continue;
                trail.setAlpha((int) (120 * (1f - i / (float) tx.length)));
                c.drawCircle(tx[i], ty[i], (9 - i) * density, trail);
            }
            if (rippleT >= 0) {
                ripple.setStrokeWidth(3 * density);
                ripple.setAlpha((int) (255 * (1 - rippleT)));
                c.drawCircle(px, py, (12 + 26 * rippleT) * density, ripple);
            }
            c.drawCircle(px, py, 11 * density, dot);
            c.drawCircle(px, py, 11 * density, ring);
        }
    }
}
