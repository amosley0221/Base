package com.amosley.base;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Rojo using the phone (Android): look at the app in front as a numbered list of
 * elements, then tap / type / scroll / go back / open an app or a link.
 * While a run is active, a glowing border and Rojo's pointer show what he's doing,
 * and a pill at the top lets you stop him. Taps on buttons that publish, send,
 * pay or delete wait for you to tap Allow.
 */
class RojoControl {

    interface Done { void done(JSONObject result); }

    /** Buttons that do something you can't take back — these need the user's OK. */
    private static final Pattern RISKY = Pattern.compile(
        "\\b(post|send|publish|tweet|reply|repost|share|buy|pay|purchase|order|checkout|check out|place order|subscribe|"
            + "confirm|delete|remove|transfer|donate|book|submit|sign up|unfollow|block|report|accept)\\b",
        Pattern.CASE_INSENSITIVE);

    private final AccessibilityService svc;
    private final WindowManager wm;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<AccessibilityNodeInfo> nodes = new ArrayList<>();
    private RojoControlOverlay overlay;
    private LinearLayout pill;
    private TextView pillText;
    private TextView pillAllow;
    private TextView pillStop;
    private boolean active;
    private volatile boolean stopped;
    private Runnable pendingAllow, pendingDeny;

    RojoControl(AccessibilityService svc) {
        this.svc = svc;
        this.wm = (WindowManager) svc.getSystemService(AccessibilityService.WINDOW_SERVICE);
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, svc.getResources().getDisplayMetrics());
    }

    boolean isActive() { return active; }
    boolean isStopped() { return stopped; }

    // ---------------------------------------------------------------- run on/off
    void start(String goal) {
        main.post(() -> {
            stopped = false;
            if (active) { setPill("Rojo is on it: " + goal, false); return; }
            active = true;
            overlay = new RojoControlOverlay(svc);
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
            if (Build.VERSION.SDK_INT >= 28) lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            try { wm.addView(overlay, lp); } catch (Exception e) { overlay = null; }
            buildPill();
            setPill("Rojo is on it: " + goal, false);
        });
    }

    void end(String message) {
        main.post(() -> {
            active = false;
            if (pendingDeny != null) { Runnable d = pendingDeny; pendingAllow = pendingDeny = null; d.run(); }
            try { if (overlay != null) wm.removeView(overlay); } catch (Exception ignored) {}
            try { if (pill != null) wm.removeView(pill); } catch (Exception ignored) {}
            overlay = null; pill = null;
            nodes.clear();
        });
    }

    private void buildPill() {
        pill = new LinearLayout(svc);
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        pill.setPadding(dp(16), dp(8), dp(8), dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(24));
        bg.setColor(0xF2151410);
        bg.setStroke(dp(2), AgentMascotView.ROJO_RED);
        pill.setBackground(bg);
        pill.setElevation(dp(6));
        pillText = new TextView(svc);
        pillText.setTextColor(0xFFF1ECE4);
        pillText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f);
        pillText.setMaxWidth(dp(230));
        pillText.setMaxLines(3);
        pillText.setEllipsize(TextUtils.TruncateAt.END);
        pill.addView(pillText);
        pillAllow = button("Allow", AgentMascotView.ROJO_RED, Color.WHITE);
        pillAllow.setOnClickListener(v -> { Runnable a = pendingAllow; pendingAllow = pendingDeny = null; if (a != null) a.run(); });
        pill.addView(pillAllow);
        pillStop = button("Stop", 0x00000000, 0xFFF1ECE4);
        pillStop.setOnClickListener(v -> {
            stopped = true;
            Runnable d = pendingDeny; pendingAllow = pendingDeny = null;
            if (d != null) d.run();
            setPill("Stopping…", false);
        });
        pill.addView(pillStop);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.y = dp(44);
        try { wm.addView(pill, lp); } catch (Exception e) { pill = null; }
    }

    private TextView button(String label, int bg, int fg) {
        TextView b = new TextView(svc);
        b.setText(label);
        b.setTextColor(fg);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f);
        b.setPadding(dp(14), dp(7), dp(14), dp(7));
        GradientDrawable d = new GradientDrawable();
        d.setCornerRadius(dp(18));
        d.setColor(bg);
        if (bg == 0) d.setStroke(dp(1), 0x66F1ECE4);
        b.setBackground(d);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = dp(8);
        b.setLayoutParams(lp);
        return b;
    }

    private void setPill(String text, boolean asking) {
        if (pill == null) return;
        pillText.setText(text);
        pillAllow.setVisibility(asking ? View.VISIBLE : View.GONE);
        pillStop.setText(asking ? "Don't" : "Stop");
    }

    // ---------------------------------------------------------------- look
    private AccessibilityNodeInfo targetRoot() {
        String own = svc.getPackageName();
        try {
            List<AccessibilityWindowInfo> ws = svc.getWindows();
            for (int pass = 0; pass < 2; pass++) {
                for (AccessibilityWindowInfo w : ws) {
                    if (w.getType() != AccessibilityWindowInfo.TYPE_APPLICATION) continue;
                    if (pass == 0 && !(w.isActive() || w.isFocused())) continue;
                    AccessibilityNodeInfo r = w.getRoot();
                    if (r == null || r.getPackageName() == null || own.contentEquals(r.getPackageName())) continue;
                    return r;
                }
            }
        } catch (Exception ignored) {}
        AccessibilityNodeInfo r = svc.getRootInActiveWindow();
        if (r != null && r.getPackageName() != null && !own.contentEquals(r.getPackageName())) return r;
        return null;
    }

    private static String label(AccessibilityNodeInfo n) {
        CharSequence t = n.getText();
        if (TextUtils.isEmpty(t)) t = n.getContentDescription();
        if (TextUtils.isEmpty(t) && Build.VERSION.SDK_INT >= 26) t = n.getHintText();
        if (TextUtils.isEmpty(t)) {
            String id = n.getViewIdResourceName();
            if (id != null && id.contains("/")) t = id.substring(id.indexOf('/') + 1).replace('_', ' ');
        }
        if (t == null) return "";
        String s = t.toString().replaceAll("\\s+", " ").trim();
        return s.length() > 80 ? s.substring(0, 80) + "…" : s;
    }

    private static String role(AccessibilityNodeInfo n) {
        String cls = n.getClassName() == null ? "" : n.getClassName().toString();
        if (n.isEditable() || cls.endsWith("EditText")) return n.isPassword() ? "password field" : "field";
        if (n.isCheckable()) return cls.contains("Switch") ? "switch" : "checkbox";
        if (cls.endsWith("Image") || cls.endsWith("ImageView") || cls.endsWith("ImageButton")) return "icon button";
        return "button";
    }

    /** The screen as numbered elements Rojo can act on, plus visible text for context. */
    JSONObject look() {
        JSONObject o = new JSONObject();
        try {
            nodes.clear();
            AccessibilityNodeInfo root = targetRoot();
            if (root == null) { o.put("ok", false).put("error", "No app is open in front of BASE."); return o; }
            String pkg = String.valueOf(root.getPackageName());
            o.put("ok", true).put("package", pkg).put("app", appLabel(pkg));
            StringBuilder els = new StringBuilder(), text = new StringBuilder();
            String[] url = { null };
            walk(root, els, text, url, 0);
            if (url[0] != null) o.put("url", url[0]);
            o.put("elements", els.toString());
            o.put("text", text.length() > 3500 ? text.substring(0, 3500) + "…" : text.toString());
        } catch (Exception e) {
            try { o.put("ok", false).put("error", "Couldn't read the screen."); } catch (Exception ignored) {}
        }
        return o;
    }

    private void walk(AccessibilityNodeInfo n, StringBuilder els, StringBuilder text, String[] url, int depth) {
        if (n == null || depth > 60 || nodes.size() >= 140) return;
        if (!n.isVisibleToUser()) return;
        String id = n.getViewIdResourceName();
        if (id != null && (id.endsWith(":id/url_bar") || id.endsWith("location_bar_edit_text") || id.endsWith("mozac_browser_toolbar_url_view")) && url[0] == null) {
            CharSequence t = n.getText();
            if (t != null) url[0] = t.toString();
        }
        boolean actionable = n.isClickable() || n.isEditable() || n.isCheckable() || n.isLongClickable();
        String lab = label(n);
        if (actionable && (!lab.isEmpty() || n.isEditable())) {
            nodes.add(n);
            els.append('[').append(nodes.size()).append("] ").append(role(n)).append(" \"").append(n.isPassword() ? "(hidden)" : lab).append('"');
            if (n.isCheckable()) els.append(n.isChecked() ? " (on)" : " (off)");
            els.append('\n');
        } else if (!lab.isEmpty() && !n.isPassword() && text.length() < 4000 && n.getChildCount() == 0) {
            text.append(lab).append('\n');
        }
        for (int i = 0; i < n.getChildCount(); i++) walk(n.getChild(i), els, text, url, depth + 1);
    }

    private String appLabel(String pkg) {
        try {
            PackageManager pm = svc.getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) { return pkg; }
    }

    // ---------------------------------------------------------------- act
    /** Runs one action; calls back with {ok, error?, stopped?} after the screen settles. */
    void act(JSONObject a, Done cb) {
        main.post(() -> {
            if (stopped) { cb.done(result(false, "The user tapped Stop.", true)); return; }
            String action = a.optString("action");
            try {
                switch (action) {
                    case "open": open(a, cb); break;
                    case "tap": tap(a.optInt("id", -1), cb); break;
                    case "type": type(a.optInt("id", -1), a.optString("text", ""), a.optBoolean("submit", false), cb); break;
                    case "scroll": scroll(a.optString("direction", "down"), cb); break;
                    case "back": svc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK); settle(cb, result(true, null, false)); break;
                    case "wait": settle(cb, result(true, null, false), 1500); break;
                    default: cb.done(result(false, "Unknown action " + action, false));
                }
            } catch (Exception e) {
                cb.done(result(false, "That didn't work: " + e.getMessage(), false));
            }
        });
    }

    private static JSONObject result(boolean ok, String error, boolean stoppedByUser) {
        JSONObject r = new JSONObject();
        try {
            r.put("ok", ok);
            if (error != null) r.put("error", error);
            if (stoppedByUser) r.put("stopped", true);
        } catch (Exception ignored) {}
        return r;
    }

    private void settle(Done cb, JSONObject r) { settle(cb, r, 900); }
    private void settle(Done cb, JSONObject r, long ms) { main.postDelayed(() -> cb.done(r), ms); }

    private void open(JSONObject a, Done cb) {
        String url = a.optString("url", "");
        String app = a.optString("app", "");
        Intent i = null;
        if (!url.isEmpty()) {
            if (!url.matches("(?i)^https?://.+")) { cb.done(result(false, "Only http(s) links can be opened.", false)); return; }
            i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        } else if (!app.isEmpty()) {
            String pkg = findApp(app);
            if (pkg == null) { cb.done(result(false, "No app called \"" + app + "\" is installed.", false)); return; }
            i = svc.getPackageManager().getLaunchIntentForPackage(pkg);
        }
        if (i == null) { cb.done(result(false, "Give a url or an app name.", false)); return; }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        svc.startActivity(i);
        setPill("Opening " + (url.isEmpty() ? app : Uri.parse(url).getHost()) + "…", false);
        settle(cb, result(true, null, false), 2200);
    }

    private String findApp(String name) {
        String want = name.toLowerCase(Locale.ROOT).trim();
        PackageManager pm = svc.getPackageManager();
        Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        String partial = null;
        for (ResolveInfo ri : pm.queryIntentActivities(q, 0)) {
            String l = String.valueOf(ri.loadLabel(pm)).toLowerCase(Locale.ROOT).trim();
            if (l.equals(want)) return ri.activityInfo.packageName;
            if (partial == null && (l.contains(want) || want.contains(l))) partial = ri.activityInfo.packageName;
        }
        return partial;
    }

    private AccessibilityNodeInfo node(int id) {
        if (id < 1 || id > nodes.size()) return null;
        AccessibilityNodeInfo n = nodes.get(id - 1);
        try { n.refresh(); } catch (Exception ignored) {}
        return n;
    }

    private void tap(int id, Done cb) {
        AccessibilityNodeInfo n = node(id);
        if (n == null) { cb.done(result(false, "There's no element [" + id + "]. Look at the screen again.", false)); return; }
        String lab = label(n);
        Runnable doTap = () -> {
            Rect b = new Rect();
            n.getBoundsInScreen(b);
            setPill("Tapping \"" + lab + "\"", false);
            pointAt(b, () -> {
                AccessibilityNodeInfo c = n;
                while (c != null && !c.isClickable()) c = c.getParent();
                boolean ok = c != null && c.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                if (!ok) ok = gestureTap(b.exactCenterX(), b.exactCenterY());
                if (overlay != null) overlay.tapRipple();
                settle(cb, ok ? result(true, null, false) : result(false, "The tap didn't go through.", false));
            });
        };
        if (RISKY.matcher(lab).find()) {
            ask("Rojo wants to tap \"" + lab + "\". OK?", doTap, () -> cb.done(result(false, "The user said no to tapping \"" + lab + "\".", stopped)));
        } else doTap.run();
    }

    private void type(int id, String text, boolean submit, Done cb) {
        AccessibilityNodeInfo n = node(id);
        if (n == null) { cb.done(result(false, "There's no element [" + id + "]. Look at the screen again.", false)); return; }
        if (n.isPassword()) { cb.done(result(false, "Rojo never types into password fields. Ask the user to do it.", false)); return; }
        Rect b = new Rect();
        n.getBoundsInScreen(b);
        setPill("Typing…", false);
        pointAt(b, () -> {
            n.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            n.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
            Bundle args = new Bundle();
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
            boolean ok = n.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
            if (ok && submit && Build.VERSION.SDK_INT >= 30) n.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
            settle(cb, ok ? result(true, null, false) : result(false, "Couldn't type there; it may not be a text field.", false));
        });
    }

    private void scroll(String dir, Done cb) {
        AccessibilityNodeInfo root = targetRoot();
        AccessibilityNodeInfo best = biggestScrollable(root, null);
        boolean down = !"up".equalsIgnoreCase(dir);
        boolean ok = best != null && best.performAction(down ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD);
        if (!ok) {
            Rect s = new Rect();
            if (root != null) root.getBoundsInScreen(s);
            float x = s.exactCenterX(), y1 = s.top + s.height() * (down ? 0.75f : 0.3f), y2 = s.top + s.height() * (down ? 0.3f : 0.75f);
            ok = swipe(x, y1, x, y2);
        }
        settle(cb, ok ? result(true, null, false) : result(false, "Nothing to scroll here.", false));
    }

    private AccessibilityNodeInfo biggestScrollable(AccessibilityNodeInfo n, AccessibilityNodeInfo best) {
        if (n == null) return best;
        if (n.isScrollable() && n.isVisibleToUser() && (best == null || area(n) > area(best))) best = n;
        for (int i = 0; i < n.getChildCount(); i++) best = biggestScrollable(n.getChild(i), best);
        return best;
    }
    private static long area(AccessibilityNodeInfo n) {
        Rect r = new Rect();
        n.getBoundsInScreen(r);
        return (long) r.width() * r.height();
    }

    private boolean gestureTap(float x, float y) {
        if (Build.VERSION.SDK_INT < 24) return false;
        Path p = new Path();
        p.moveTo(x, y);
        GestureDescription g = new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(p, 0, 60)).build();
        return svc.dispatchGesture(g, null, null);
    }

    private boolean swipe(float x1, float y1, float x2, float y2) {
        if (Build.VERSION.SDK_INT < 24) return false;
        Path p = new Path();
        p.moveTo(x1, y1);
        p.lineTo(x2, y2);
        GestureDescription g = new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(p, 0, 320)).build();
        return svc.dispatchGesture(g, null, null);
    }

    private void pointAt(Rect b, Runnable then) {
        if (overlay == null) { then.run(); return; }
        overlay.moveTo(b.exactCenterX(), b.exactCenterY(), then);
        BaseAgentService s = BaseAgentService.instance;
        if (s != null) s.glanceAt(b.exactCenterX(), b.exactCenterY());
    }

    private void ask(String question, Runnable allow, Runnable deny) {
        pendingAllow = allow;
        pendingDeny = deny;
        setPill(question, true);
        // Give up (as a "no") if nobody answers in a minute.
        main.postDelayed(() -> {
            if (pendingDeny == deny) { pendingAllow = pendingDeny = null; setPill("No answer, so Rojo didn't tap it.", false); deny.run(); }
        }, 60000);
    }
}
