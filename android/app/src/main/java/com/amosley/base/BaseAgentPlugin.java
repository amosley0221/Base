package com.amosley.base;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/** JS bridge for the floating agent: setup status, settings shortcuts, screen text. */
@CapacitorPlugin(name = "BaseAgent")
public class BaseAgentPlugin extends Plugin {

    private SharedPreferences prefs() {
        return BaseAgentService.prefs(getContext());
    }

    private boolean serviceEnabled() {
        String s = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (s == null) return false;
        ComponentName me = new ComponentName(getContext(), BaseAgentService.class);
        for (String part : s.split(":")) {
            if (me.equals(ComponentName.unflattenFromString(part))) return true;
        }
        return false;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("native", true);
        r.put("accessibility", serviceEnabled());
        r.put("running", BaseAgentService.instance != null);
        r.put("bubble", prefs().getBoolean("bubble", true));
        r.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("inAgent", getActivity() instanceof AgentActivity);
        call.resolve(r);
    }

    private void launch(PluginCall call, Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't open that settings page");
        }
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        launch(call, new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
    }

    @PluginMethod
    public void openAppInfo(PluginCall call) {
        launch(call, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", getContext().getPackageName(), null)));
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        launch(call, i);
    }

    @PluginMethod
    public void setBubble(PluginCall call) {
        prefs().edit().putBoolean("bubble", Boolean.TRUE.equals(call.getBoolean("enabled", true))).apply();
        BaseAgentService.refreshFromPrefs();
        call.resolve();
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        prefs().edit().putBoolean("dark", Boolean.TRUE.equals(call.getBoolean("dark", false))).apply();
        BaseAgentService.refreshFromPrefs();
        call.resolve();
    }

    @PluginMethod
    public void setNudge(PluginCall call) {
        String text = call.getString("text", "");
        String tone = call.getString("tone", "info");
        if (text == null) text = "";
        boolean changed = !text.equals(prefs().getString("nudge", ""));
        prefs().edit().putString("nudge", text).putString("nudgeTone", tone).apply();
        if (changed && !text.isEmpty()) BaseAgentService.nudgeChanged();
        else BaseAgentService.refreshFromPrefs();
        call.resolve();
    }

    /** The screen captured when the mascot was tapped. */
    @PluginMethod
    public void getScreen(PluginCall call) {
        JSONObject s = BaseAgentService.lastScreen;
        try {
            call.resolve(s == null ? new JSObject().put("ok", false) : JSObject.fromJSONObject(s));
        } catch (Exception e) {
            call.resolve(new JSObject().put("ok", false));
        }
    }

    /** Re-read the app under the agent sheet right now. */
    @PluginMethod
    public void refreshScreen(PluginCall call) {
        BaseAgentService svc = BaseAgentService.instance;
        if (svc == null) {
            call.resolve(new JSObject().put("ok", false).put("reason", "accessibility off"));
            return;
        }
        try {
            JSONObject s = svc.captureScreen();
            if (s.optBoolean("ok")) BaseAgentService.lastScreen = s;
            call.resolve(JSObject.fromJSONObject(s));
        } catch (Exception e) {
            call.resolve(new JSObject().put("ok", false));
        }
    }

    /** From focus.js: a session started / paused / ended. */
    @PluginMethod
    public void setFocus(PluginCall call) {
        JSObject d = call.getData();
        BaseAgentService.setFocus(getContext(), d.optBoolean("active", false), d.optString("task", ""),
            d.optLong("endsAt", 0), d.optLong("startedAt", 0));
        call.resolve();
    }

    /** How many times Rojo nudged you this session, and which apps. */
    @PluginMethod
    public void getFocusStats(PluginCall call) {
        SharedPreferences p = prefs();
        JSObject r = new JSObject();
        r.put("nudges", p.getInt("focusNudges", 0));
        r.put("apps", p.getString("focusApps", ""));
        call.resolve(r);
    }

    @PluginMethod
    public void closeAgent(PluginCall call) {
        Activity a = getActivity();
        if (a instanceof AgentActivity) a.runOnUiThread(((AgentActivity) a)::close);
        call.resolve();
    }

    /** Jump from the agent sheet into the full BASE app. */
    @PluginMethod
    public void openApp(PluginCall call) {
        Activity a = getActivity();
        Intent i = new Intent(getContext(), MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        String path = call.getString("path");
        if (path != null && path.matches("[A-Za-z0-9_-]+\\.html")) i.putExtra("path", path);
        a.startActivity(i);
        if (a instanceof AgentActivity) a.runOnUiThread(((AgentActivity) a)::close);
        call.resolve();
    }
}
