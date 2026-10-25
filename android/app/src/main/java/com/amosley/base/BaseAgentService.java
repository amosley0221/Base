package com.amosley.base;

import android.accessibilityservice.AccessibilityService;
import android.animation.ValueAnimator;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
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
import java.util.Arrays;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;

/**
 * BASE agent service. Runs as an accessibility service so it can:
 *  - float the agent mascot (and its nudge pill) over other apps, and
 *  - read the text of the app/site on screen when the mascot is tapped.
 * Screen text is only read on a tap (or when the agent asks to re-read),
 * never in the background.
 *
 * During a Rojo focus session it also watches which app is in front (just the
 * app's package name, from window-change events) and nudges you if you stay
 * in a distracting app (social, video, games) for a little while.
 *
 * Offers: from the same app name, Rojo can offer help that fits (open a fantasy
 * football app in season and he asks if you want lineup suggestions). Yes opens
 * the chat with the screen read and the question asked; ✕ means not today.
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
    private TextView pillYes;
    private boolean attached;
    private boolean unlocked = true;
    private boolean hiddenUntilUnlock;
    private boolean onRight = true;
    private String dismissedNudge = "";
    private BroadcastReceiver screenReceiver;
    private final Runnable collapsePill = () -> showPill(false);

    // ---- focus sessions / off-task nudges
    static final long GRACE_MS = 20000;       // how long in a distracting app before a nudge
    static final long COOLDOWN_MS = 120000;   // between nudges
    private static final Set<String> DISTRACTING = new HashSet<>(Arrays.asList(
        "com.instagram.android", "com.instagram.barcelona", "com.zhiliaoapp.musically", "com.ss.android.ugc.trill",
        "com.twitter.android", "com.facebook.katana", "com.facebook.lite", "com.snapchat.android",
        "com.google.android.youtube", "com.reddit.frontpage", "com.netflix.mediaclient", "tv.twitch.android.app",
        "com.pinterest", "com.tumblr", "com.bereal.ft", "com.hulu.plus", "com.disney.disneyplus",
        "com.amazon.avod.thirdpartyclient", "com.discord", "com.google.android.apps.youtube.music.pwa"));
    RojoControl control;
    private String fgPkg = "";
    private long lastNudgeAt = 0;
    private String focusPill = null;
    private boolean forcedShow = false;
    private final Runnable offTaskCheck = this::checkOffTask;
    private String offerPill = null;   // the offer showing in the pill ("Want lineup suggestions?")
    private String offerAsk = null;    // what Rojo is asked if you say yes
    private final Runnable offerCheck = this::checkOffer;
    private final Runnable endOffer = () -> {
        offerPill = null;
        offerAsk = null;
        forcedShow = focusPill != null;
        showPill(false);
        if (mascot != null) mascot.setMood(focusRunning() ? "focused" : "idle");
        applyState();
    };
    private final Runnable endFocusPill = () -> {
        focusPill = null;
        forcedShow = false;
        showPill(false);
        if (mascot != null) mascot.setMood(focusRunning() ? "focused" : "idle");
        applyState();
    };

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

    /** From the JS focus timer: whether a session is running, its task and end time. */
    static void setFocus(Context c, boolean active, String task, long endsAt, long startedAt) {
        SharedPreferences p = prefs(c);
        SharedPreferences.Editor e = p.edit()
            .putBoolean("focusActive", active).putString("focusTask", task == null ? "" : task).putLong("focusEndsAt", endsAt);
        if (startedAt != 0 && startedAt != p.getLong("focusStartedAt", 0)) {
            e.putLong("focusStartedAt", startedAt).putInt("focusNudges", 0).putString("focusApps", "");
        }
        e.apply();
        BaseAgentService s = instance;
        if (s != null) s.main.post(s::onFocusChanged);
    }

    static void setAgentOpen(boolean open) {
        agentOpen = open;
        refreshFromPrefs();
        // The app under the chat sheet never left, so Android may not say it's in front again: look.
        BaseAgentService s = instance;
        if (!open && s != null) s.main.postDelayed(s::redetectForeground, 350);
    }

    /** Which app is really in front (from the window list), when no window-change event tells us. */
    private void redetectForeground() {
        try {
            for (AccessibilityWindowInfo w : getWindows()) {
                if (w.getType() != AccessibilityWindowInfo.TYPE_APPLICATION || !(w.isActive() || w.isFocused())) continue;
                AccessibilityNodeInfo r = w.getRoot();
                if (r == null || r.getPackageName() == null) continue;
                String pkg = r.getPackageName().toString();
                if (pkg.equals(getPackageName()) || isTransient(pkg)) return;   // BASE itself (e.g. Rojo's screen) is in front
                if (!pkg.equals(fgPkg)) fgPkg = pkg;
                applyState();
                return;
            }
        } catch (Exception ignored) {}
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        control = new RojoControl(this);
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
        if (event == null) return;
        // Rojo glances at whatever you tap in other apps (like Bluey following the mouse).
        if (event.getEventType() == AccessibilityEvent.TYPE_VIEW_CLICKED) {
            AccessibilityNodeInfo src = event.getSource();
            if (src != null && attached) {
                Rect b = new Rect();
                src.getBoundsInScreen(b);
                glanceAt(b.exactCenterX(), b.exactCenterY());
            }
            return;
        }
        // Otherwise only used to know which app is in front during a focus session.
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pc = event.getPackageName();
        if (pc == null) return;
        String pkg = pc.toString();
        if (pkg.equals(fgPkg) || isTransient(pkg)) return;
        // BASE only counts as "in front" for its main screen; the chat sheet and pop-ups sit over another app.
        if (pkg.equals(getPackageName())) {
            CharSequence cls = event.getClassName();
            if (cls == null || !cls.toString().endsWith(".MainActivity")) return;
        }
        boolean ownChanged = pkg.equals(getPackageName()) != fgPkg.equals(getPackageName());
        fgPkg = pkg;
        main.removeCallbacks(offTaskCheck);
        if (focusRunning() && isDistracting(pkg)) main.postDelayed(offTaskCheck, GRACE_MS);
        main.removeCallbacks(offerCheck);
        if (offerPill != null) endOffer.run();
        main.postDelayed(offerCheck, 2500);   // settle in first; only if you're still there
        if (ownChanged) applyState();         // BASE has its own Rojo, so the floating one steps aside
    }

    // ------------------------------------------------------------ offers
    /** What kind of help fits this app, or null. Only the app's name is used. */
    private String offerKind(String pkg) {
        if (pkg == null || pkg.isEmpty() || pkg.equals(getPackageName())) return null;
        String label = appLabel(pkg, null).toLowerCase();
        if (label.contains("fantasy") || pkg.toLowerCase().contains("fantasy") || label.equals("sleeper")) return "fantasy";
        return null;
    }

    /** NFL season, roughly: September through early February. */
    private static boolean footballSeason(Calendar c) {
        int m = c.get(Calendar.MONTH);
        return m >= Calendar.SEPTEMBER || m == Calendar.JANUARY || (m == Calendar.FEBRUARY && c.get(Calendar.DAY_OF_MONTH) <= 10);
    }

    private void checkOffer() {
        SharedPreferences p = prefs(this);
        if (!p.getBoolean("offers", true) || !unlocked || agentOpen || hiddenUntilUnlock || focusPill != null) return;
        if (focusRunning() || (control != null && control.isActive())) return;
        String kind = offerKind(fgPkg);
        if (kind == null) return;
        Calendar c = Calendar.getInstance();
        if ("fantasy".equals(kind) && !footballSeason(c)) return;
        String today = c.get(Calendar.YEAR) + "-" + c.get(Calendar.DAY_OF_YEAR);
        if (today.equals(p.getString("offerDay_" + kind, ""))) return;   // once a day per kind
        p.edit().putString("offerDay_" + kind, today).apply();

        int dow = c.get(Calendar.DAY_OF_WEEK);
        String day = new String[] { "", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" }[dow];
        boolean waivers = dow == Calendar.TUESDAY || dow == Calendar.WEDNESDAY;
        if (dow == Calendar.SUNDAY) offerPill = "It's football Sunday! \uD83C\uDFC8 Want lineup suggestions before kickoff?";
        else if (dow == Calendar.MONDAY) offerPill = "Monday night football tonight. Want a quick lineup check?";
        else if (dow == Calendar.THURSDAY) offerPill = "Thursday night game tonight. Want lineup suggestions?";
        else if (waivers) offerPill = "Waivers are coming up. Want pickup and lineup ideas?";
        else offerPill = "Game weekend's coming. Want lineup suggestions?";
        offerAsk = "It's " + day + ". I'm in my fantasy football app (" + appLabel(fgPkg, null) + "), it's on my screen. "
            + (waivers ? "Suggest waiver pickups worth grabbing and any lineup changes for this week. "
                       : "Look at my lineup and suggest who to start or sit this week. ")
            + "Check injuries, byes and the latest news. Keep it short: list the changes you'd make and why, then ask if I want you to make them.";
        forcedShow = true;
        applyState();
        if (mascot != null) { mascot.setMood("surprised"); main.postDelayed(() -> { if (offerPill != null && mascot != null) mascot.setMood("idle"); }, 2000); }
        showPill(true);
        main.removeCallbacks(endOffer);
        main.postDelayed(endOffer, 20000);
    }

    private void acceptOffer() {
        String ask = offerAsk;
        main.removeCallbacks(endOffer);
        endOffer.run();
        if (ask == null) return;
        prefs(this).edit().putString("offerAsk", ask).apply();
        openAgent("offer");
    }

    // ------------------------------------------------------------ focus
    private boolean focusRunning() {
        SharedPreferences p = prefs(this);
        return p.getBoolean("focusActive", false) && p.getLong("focusEndsAt", 0) > System.currentTimeMillis();
    }

    /** System UI and keyboards pop up over apps; they don't change which app you're in. */
    private boolean isTransient(String pkg) {
        if (pkg.equals("com.android.systemui") || pkg.contains("inputmethod") || pkg.contains("keyboard")) return true;
        String ime = Settings.Secure.getString(getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        return ime != null && ime.startsWith(pkg + "/");
    }

    private boolean isDistracting(String pkg) {
        if (pkg == null || pkg.isEmpty() || pkg.equals(getPackageName())) return false;
        if (DISTRACTING.contains(pkg)) return true;
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                ApplicationInfo ai = getPackageManager().getApplicationInfo(pkg, 0);
                return ai.category == ApplicationInfo.CATEGORY_GAME
                    || ai.category == ApplicationInfo.CATEGORY_SOCIAL
                    || ai.category == ApplicationInfo.CATEGORY_VIDEO;
            } catch (Exception ignored) {}
        }
        return false;
    }

    /** Turn Rojo's eyes toward a point on the screen for a moment. */
    void glanceAt(float x, float y) {
        main.post(() -> {
            if (mascot == null || !attached) return;
            int[] loc = new int[2];
            mascot.getLocationOnScreen(loc);
            float cx = loc[0] + mascot.getWidth() / 2f;
            float reach = Math.max(1, screenBounds().width() / 2f);
            mascot.lookToward((x - cx) / reach);
        });
    }

    private void onFocusChanged() {
        boolean running = focusRunning();
        if (mascot != null && focusPill == null) mascot.setMood(running ? "focused" : "idle");
        main.removeCallbacks(offTaskCheck);
        if (running && isDistracting(fgPkg)) main.postDelayed(offTaskCheck, GRACE_MS);
        if (!running && focusPill != null) endFocusPill.run();
    }

    private void checkOffTask() {
        if (!focusRunning() || !isDistracting(fgPkg)) return;
        if (control != null && control.isActive()) { main.postDelayed(offTaskCheck, GRACE_MS); return; }   // Rojo's own doing
        long now = System.currentTimeMillis();
        long wait = COOLDOWN_MS - (now - lastNudgeAt);
        if (wait > 0) { main.postDelayed(offTaskCheck, wait); return; }
        nudge(fgPkg);
        main.postDelayed(offTaskCheck, COOLDOWN_MS);   // again later if you're still there
    }

    private void nudge(String pkg) {
        lastNudgeAt = System.currentTimeMillis();
        SharedPreferences p = prefs(this);
        String task = p.getString("focusTask", "");
        long left = Math.max(1, (p.getLong("focusEndsAt", 0) - lastNudgeAt + 59999) / 60000);
        String app = appLabel(pkg, null);
        String apps = p.getString("focusApps", "");
        if (!(", " + apps + ",").contains(", " + app + ",")) apps = apps.isEmpty() ? app : apps + ", " + app;
        p.edit().putInt("focusNudges", p.getInt("focusNudges", 0) + 1).putString("focusApps", apps).apply();

        String[] lines = {
            "Psst! Weren't you working on " + task + "? " + left + " min left.",
            "Hey, " + app + " can wait. Back to " + task + "?",
            left + " min to go on " + task + ". You've got this!",
        };
        focusPill = lines[(int) (Math.random() * lines.length)];
        forcedShow = true;
        applyState();
        if (mascot != null) {
            mascot.setMood("surprised");
            main.postDelayed(() -> { if (focusPill != null && mascot != null) mascot.setMood("focused"); }, 2500);
        }
        showPill(true);
        main.removeCallbacks(endFocusPill);
        main.postDelayed(endFocusPill, 10000);
        buzz();
        chirp();
    }

    private void buzz() {
        try {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[] { 0, 35, 90, 35 }, -1));
        } catch (Exception ignored) {}
    }

    /** Rojo's little "uh-oh" chirp, on the notification channel (silent mode silences it). */
    private void chirp() {
        new Thread(() -> {
            try {
                int rate = 22050;
                double[][] blips = { { 720, 500, 0.12 }, { 600, 420, 0.16 } };
                int total = 0;
                for (double[] b : blips) total += (int) (rate * (b[2] + 0.03));
                short[] pcm = new short[total];
                int at = 0;
                for (double[] b : blips) {
                    int n = (int) (rate * b[2]);
                    double phase = 0;
                    for (int i = 0; i < n; i++) {
                        double t = (double) i / n;
                        double f = b[0] * Math.pow(b[1] / b[0], t);
                        phase += 2 * Math.PI * f / rate;
                        double env = Math.min(1, t * 40) * Math.pow(1 - t, 1.5);
                        pcm[at + i] = (short) (Math.sin(phase) * env * 9000);
                    }
                    at += (int) (rate * (b[2] + 0.03));
                }
                AudioTrack track = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setBufferSizeInBytes(pcm.length * 2)
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .build();
                track.write(pcm, 0, pcm.length);
                track.play();
                Thread.sleep(600);
                track.release();
            } catch (Exception ignored) {}
        }).start();
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
        if (control != null) control.end(null);
        focusPill = null;
        offerPill = null;
        offerAsk = null;
        forcedShow = false;
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
        mascot.setContentDescription("Rojo. Tap to ask anything.");
        mascot.setMood(focusRunning() ? "focused" : "idle");

        pill = new LinearLayout(this);
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        pill.setPadding(dp(14), dp(9), dp(4), dp(9));
        pill.setElevation(dp(5));
        pill.setVisibility(View.GONE);
        pill.setOnClickListener(v -> { if (offerPill != null) acceptOffer(); else openAgent("nudge"); });

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

        pillYes = new TextView(this);
        pillYes.setText("Yes");
        pillYes.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        pillYes.setTextColor(0xFFFFFFFF);
        pillYes.setPadding(dp(14), dp(6), dp(14), dp(6));
        GradientDrawable yb = new GradientDrawable();
        yb.setCornerRadius(dp(16));
        yb.setColor(AgentMascotView.ROJO_RED);
        pillYes.setBackground(yb);
        pillYes.setVisibility(View.GONE);
        pillYes.setOnClickListener(v -> acceptOffer());
        LinearLayout.LayoutParams ylp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        ylp.leftMargin = dp(10);
        pill.addView(pillYes, ylp);

        pillClose = new TextView(this);
        pillClose.setText("✕");
        pillClose.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        pillClose.setPadding(dp(10), dp(4), dp(10), dp(4));
        pillClose.setAlpha(0.55f);
        pillClose.setContentDescription("Dismiss");
        pillClose.setOnClickListener(v -> {
            if (focusPill != null) { main.removeCallbacks(endFocusPill); endFocusPill.run(); return; }
            if (offerPill != null) { main.removeCallbacks(endOffer); endOffer.run(); return; }   // not today
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
                Toast.makeText(BaseAgentService.this, "Rojo is hiding until you unlock again", Toast.LENGTH_SHORT).show();
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
        int accent = AgentMascotView.ROJO_RED;

        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(22));
        bg.setColor(dark ? 0xF51C1F15 : 0xF5FFFFFF);
        bg.setStroke(Math.max(1, dp(1)), dark ? 0x30ECEEE0 : 0x1A000000);
        pill.setBackground(bg);
        pillText.setTextColor(dark ? 0xFFECEEE0 : 0xFF2B2622);
        pillClose.setTextColor(dark ? 0xFFECEEE0 : 0xFF2B2622);

        String tone = focusPill != null ? "bad" : offerPill != null ? "info" : p.getString("nudgeTone", "info");
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor("bad".equals(tone) ? 0xFFE8281E : "warn".equals(tone) ? 0xFFE0A030 : accent);
        pillDot.setBackground(dot);
        pillText.setText(focusPill != null ? focusPill : offerPill != null ? offerPill : p.getString("nudge", ""));
        pillYes.setVisibility(focusPill == null && offerPill != null ? View.VISIBLE : View.GONE);

        // Nudges show Rojo even if the floating bubble is turned off.
        boolean want = (p.getBoolean("bubble", true) || forcedShow) && unlocked && !agentOpen && !hiddenUntilUnlock
            && !getPackageName().equals(fgPkg);
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
