package com.amosley.base;

import android.accessibilityservice.AccessibilityService;
import android.animation.ValueAnimator;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.view.animation.DecelerateInterpolator;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.util.List;
import org.json.JSONObject;

/**
 * BASE agent service. Runs as an accessibility service so it can:
 *  - float the agent mascot (and its nudge pill) over other apps, and
 *  - read the text of the app/site on screen when the mascot is tapped.
 * Screen text is only read on a tap (or when the agent asks to re-read),
 * never in the background.
 */
public class BaseAgentService extends AccessibilityService {

    static final String PREFS = "base_agent";
    static final int MAX_VISIBLE = 15000;
    static final int MAX_OFFSCREEN = 8000;

    static volatile BaseAgentService instance;
    static volatile JSONObject lastScreen;
    private static volatile boolean agentOpen;

    private final Handler main = new Handler(Looper.getMainLooper());
    private WindowManager wm;
    private WindowManager.LayoutParams lp;
    private LinearLayout root;
    private AgentMascotView mascot;
    private LinearLayout pill;
    private View pillDot;
    private TextView pillText;
    private TextView pillClose;
    private boolean attached;
    private boolean unlocked = true;
    private boolean hiddenUntilUnlock;
    private boolean onRight = true;
    private String dismissedNudge = "";
    private BroadcastReceiver screenReceiver;
    private final Runnable collapsePill = () -> showPill(false);

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Re-read bubble/theme/nudge prefs and update the overlay. */
    static void refreshFromPrefs() {
        BaseAgentService s = instance;
        if (s != null) s.main.post(s::applyState);
    }

    /** A new nudge was set: show it in the pill for a moment. */
    static void nudgeChanged() {
        BaseAgentService s = instance;
        if (s != null) s.main.post(() -> {
            s.applyState();
            s.popNudge();
        });
    }

    static void setAgentOpen(boolean open) {
        agentOpen = open;
        refreshFromPrefs();
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        buildViews();

        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String a = intent.getAction();
                if (Intent.ACTION_SCREEN_OFF.equals(a)) {
                    unlocked = false;
                    showPill(false);
                    applyState();
                } else if (Intent.ACTION_USER_PRESENT.equals(a)
                    || (Intent.ACTION_SCREEN_ON.equals(a) && !isLocked())) {
                    unlocked = true;
                    hiddenUntilUnlock = false;
                    applyState();
                    main.postDelayed(BaseAgentService.this::popNudge, 500);
                }
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenReceiver, f, Context.RECEIVER_EXPORTED);
        else registerReceiver(screenReceiver, f);

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        unlocked = (pm == null || pm.isInteractive()) && !isLocked();
        applyState();
        main.postDelayed(this::popNudge, 800);
    }

    private boolean isLocked() {
        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        return km != null && km.isKeyguardLocked();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Nothing to do per event: the screen is only read on demand.
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        cleanup();
        super.onDestroy();
    }

    @Override
    public boolean onUnbind(Intent intent) {
        cleanup();
        return super.onUnbind(intent);
    }

    private void cleanup() {
        main.removeCallbacksAndMessages(null);
        detach();
        if (screenReceiver != null) {
            try {
                unregisterReceiver(screenReceiver);
            } catch (Exception ignored) {}
            screenReceiver = null;
        }
        if (instance == this) instance = null;
    }

    // ---------------------------------------------------------------- overlay

    private void buildViews() {
        SharedPreferences p = prefs(this);
        onRight = !"L".equals(p.getString("side", "R"));

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.HORIZONTAL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setPadding(dp(6), dp(8), dp(6), dp(8));
        root.setClipToPadding(false);

        mascot = new AgentMascotView(this);
        mascot.setContentDescription("BASE agent. Tap to ask anything.");

        pill = new LinearLayout(this);
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        pill.setPadding(dp(14), dp(9), dp(4), dp(9));
        pill.setElevation(dp(5));
        pill.setVisibility(View.GONE);
        pill.setOnClickListener(v -> openAgent("nudge"));

        pillDot = new View(this);
        pill.addView(pillDot, new LinearLayout.LayoutParams(dp(8), dp(8)));

        pillText = new TextView(this);
        pillText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        pillText.setMaxWidth(dp(220));
        pillText.setMaxLines(2);
        pillText.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tlp.leftMargin = dp(9);
        pill.addView(pillText, tlp);

        pillClose = new TextView(this);
        pillClose.setText("✕");
        pillClose.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        pillClose.setPadding(dp(10), dp(4), dp(10), dp(4));
        pillClose.setAlpha(0.55f);
        pillClose.setContentDescription("Dismiss");
        pillClose.setOnClickListener(v -> {
            dismissedNudge = prefs(this).getString("nudge", "");
            showPill(false);
        });
        pill.addView(pillClose);

        arrange();

        lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | (onRight ? Gravity.RIGHT : Gravity.LEFT);
        lp.x = 0;
        lp.y = clampY(p.getInt("y", (int) (screenBounds().height() * 0.58f)));

        mascot.setOnTouchListener(new View.OnTouchListener() {
            final int slop = ViewConfiguration.get(BaseAgentService.this).getScaledTouchSlop();
            float downX, downY;
            int startX, startY;
            boolean dragging, longFired;
            final Runnable longPress = () -> {
                longFired = true;
                mascot.setPressedLook(false);
                mascot.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
                hiddenUntilUnlock = true;
                applyState();
                Toast.makeText(BaseAgentService.this, "BASE agent hidden until you unlock again", Toast.LENGTH_SHORT).show();
            };

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = e.getRawX();
                        downY = e.getRawY();
                        startX = lp.x;
                        startY = lp.y;
                        dragging = false;
                        longFired = false;
                        mascot.setPressedLook(true);
                        main.postDelayed(longPress, 650);
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - downX, dy = e.getRawY() - downY;
                        if (!dragging && Math.hypot(dx, dy) > slop && !longFired) {
                            dragging = true;
                            main.removeCallbacks(longPress);
                            mascot.setPressedLook(false);
                            showPill(false);
                        }
                        if (dragging) {
                            lp.x = Math.max(0, startX + (int) (onRight ? -dx : dx));
                            lp.y = clampY(startY + (int) dy);
                            update();
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        main.removeCallbacks(longPress);
                        mascot.setPressedLook(false);
                        if (longFired) return true;
                        if (dragging) snap();
                        else {
                            mascot.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                            openAgent(null);
                        }
                        return true;
                    case MotionEvent.ACTION_CANCEL:
                        main.removeCallbacks(longPress);
                        mascot.setPressedLook(false);
                        if (dragging) snap();
                        return true;
                }
                return false;
            }
        });
    }

    /** Pill sits on the screen-centre side of the mascot. */
    private void arrange() {
        root.removeAllViews();
        LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(dp(60), dp(60));
        if (onRight) {
            plp.rightMargin = dp(4);
            root.addView(pill, plp);
            root.addView(mascot, mlp);
        } else {
            plp.leftMargin = dp(4);
            root.addView(mascot, mlp);
            root.addView(pill, plp);
        }
    }

    private Rect screenBounds() {
        if (Build.VERSION.SDK_INT >= 30) return wm.getCurrentWindowMetrics().getBounds();
        DisplayMetrics m = new DisplayMetrics();
        //noinspection deprecation
        wm.getDefaultDisplay().getRealMetrics(m);
        return new Rect(0, 0, m.widthPixels, m.heightPixels);
    }

    private int clampY(int y) {
        int h = screenBounds().height();
        return Math.max(dp(48), Math.min(y, h - dp(150)));
    }

    private void update() {
        if (!attached) return;
        try {
            wm.updateViewLayout(root, lp);
        } catch (Exception ignored) {}
    }

    private void snap() {
        int sw = screenBounds().width();
        int w = root.getWidth();
        int left = onRight ? sw - lp.x - w : lp.x;
        boolean right = left + w / 2 > sw / 2;
        if (right != onRight) {
            onRight = right;
            arrange();
            lp.gravity = Gravity.TOP | (onRight ? Gravity.RIGHT : Gravity.LEFT);
            lp.x = Math.max(0, onRight ? sw - left - w : left);
            update();
        }
        ValueAnimator a = ValueAnimator.ofInt(lp.x, 0);
        a.setDuration(240);
        a.setInterpolator(new DecelerateInterpolator());
        a.addUpdateListener(v -> {
            lp.x = (int) v.getAnimatedValue();
            update();
        });
        a.start();
        prefs(this).edit().putString("side", onRight ? "R" : "L").putInt("y", lp.y).apply();
    }

    private void detach() {
        if (attached && root != null) {
            try {
                wm.removeView(root);
            } catch (Exception ignored) {}
        }
        attached = false;
    }

    private void applyState() {
        if (root == null) return;
        SharedPreferences p = prefs(this);
        boolean dark = p.getBoolean("dark", false);
        int accent = dark ? 0xFF6E9A3A : 0xFFE8281E;
        mascot.setColor(accent);

        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(22));
        bg.setColor(dark ? 0xF51C1F15 : 0xF5FFFFFF);
        bg.setStroke(Math.max(1, dp(1)), dark ? 0x30ECEEE0 : 0x1A000000);
        pill.setBackground(bg);
        pillText.setTextColor(dark ? 0xFFECEEE0 : 0xFF2B2622);
        pillClose.setTextColor(dark ? 0xFFECEEE0 : 0xFF2B2622);

        String tone = p.getString("nudgeTone", "info");
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor("bad".equals(tone) ? 0xFFE8281E : "warn".equals(tone) ? 0xFFE0A030 : accent);
        pillDot.setBackground(dot);
        pillText.setText(p.getString("nudge", ""));

        boolean want = p.getBoolean("bubble", true) && unlocked && !agentOpen && !hiddenUntilUnlock;
        if (want && !attached) {
            try {
                wm.addView(root, lp);
                attached = true;
            } catch (Exception ignored) {}
        } else if (!want && attached) {
            showPill(false);
            detach();
        }
        if (TextUtils.isEmpty(pillText.getText())) showPill(false);
    }

    private void popNudge() {
        String n = prefs(this).getString("nudge", "");
        if (!attached || TextUtils.isEmpty(n) || n.equals(dismissedNudge)) return;
        showPill(true);
        main.postDelayed(collapsePill, 12000);
    }

    private void showPill(boolean show) {
        main.removeCallbacks(collapsePill);
        if (pill != null) pill.setVisibility(show ? View.VISIBLE : View.GONE);
    }

    private void openAgent(String reason) {
        try {
            JSONObject s = captureScreen();
            lastScreen = s;
        } catch (Throwable t) {
            lastScreen = null;
        }
        showPill(false);
        Intent i = new Intent(this, AgentActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (reason != null) i.putExtra("reason", reason);
        agentOpen = true;
        applyState();
        try {
            startActivity(i);
        } catch (Exception e) {
            agentOpen = false;
            applyState();
        }
    }

    // ----------------------------------------------------------- screen read

    /** Text of the app window under the overlay (never BASE's own windows). */
    JSONObject captureScreen() throws Exception {
        String own = getPackageName();
        AccessibilityNodeInfo node = null;
        CharSequence title = null;
        try {
            List<AccessibilityWindowInfo> windows = getWindows();
            for (int pass = 0; pass < 2 && node == null; pass++) {
                for (AccessibilityWindowInfo w : windows) {
                    if (w.getType() != AccessibilityWindowInfo.TYPE_APPLICATION) continue;
                    if (pass == 0 && !(w.isActive() || w.isFocused())) continue;
                    AccessibilityNodeInfo r = w.getRoot();
                    if (r == null || r.getPackageName() == null) continue;
                    if (own.contentEquals(r.getPackageName())) continue;
                    node = r;
                    title = w.getTitle();
                    break;
                }
            }
        } catch (Exception ignored) {}
        if (node == null) {
            AccessibilityNodeInfo r = getRootInActiveWindow();
            if (r != null && r.getPackageName() != null && !own.contentEquals(r.getPackageName())) node = r;
        }

        JSONObject o = new JSONObject();
        o.put("capturedAt", System.currentTimeMillis());
        if (node == null) {
            o.put("ok", false);
            return o;
        }
        String pkg = node.getPackageName().toString();
        o.put("ok", true);
        o.put("package", pkg);
        o.put("app", appLabel(pkg, title));
        if (title != null) o.put("title", title.toString());

        StringBuilder visible = new StringBuilder();
        StringBuilder offscreen = new StringBuilder();
        String[] url = { null };
        walk(node, visible, offscreen, url, 0);
        if (url[0] != null) o.put("url", url[0]);
        o.put("text", visible.toString());
        o.put("offscreen", offscreen.toString());
        o.put("truncated", visible.length() >= MAX_VISIBLE || offscreen.length() >= MAX_OFFSCREEN);
        return o;
    }

    private String appLabel(String pkg, CharSequence title) {
        try {
            PackageManager pm = getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) {
            return title != null ? title.toString() : pkg;
        }
    }

    private static boolean isUrlField(String id) {
        return id != null && (id.endsWith(":id/url_bar")
            || id.endsWith(":id/location_bar_edit_text")
            || id.endsWith(":id/mozac_browser_toolbar_url_view")
            || id.endsWith(":id/url_field")
            || id.endsWith(":id/url"));
    }

    private static boolean endsWithLine(StringBuilder sb, String s) {
        int n = sb.length();
        if (n < s.length() + 1) return false;
        return sb.substring(n - s.length() - 1, n - 1).equals(s)
            && (n - s.length() - 1 == 0 || sb.charAt(n - s.length() - 2) == '\n');
    }

    private void walk(AccessibilityNodeInfo n, StringBuilder vis, StringBuilder off, String[] url, int depth) {
        if (n == null || depth > 90) return;
        if (vis.length() >= MAX_VISIBLE && off.length() >= MAX_OFFSCREEN) return;
        boolean shown = n.isVisibleToUser();
        String id = n.getViewIdResourceName();
        if (isUrlField(id)) {
            CharSequence t = n.getText();
            if (url[0] == null && t != null && t.length() > 0) url[0] = t.toString();
        } else if (!n.isPassword()) {
            CharSequence t = n.getText();
            if (t == null || t.length() == 0) t = n.getContentDescription();
            if (t != null) {
                String s = t.toString().trim();
                StringBuilder sb = shown ? vis : off;
                int max = shown ? MAX_VISIBLE : MAX_OFFSCREEN;
                if (!s.isEmpty() && sb.length() < max && !endsWithLine(sb, s)) {
                    if (sb.length() + s.length() + 1 > max) s = s.substring(0, Math.max(0, max - sb.length() - 1));
                    sb.append(s).append('\n');
                }
            }
        }
        for (int i = 0; i < n.getChildCount(); i++) {
            walk(n.getChild(i), vis, off, url, depth + 1);
        }
    }
}
