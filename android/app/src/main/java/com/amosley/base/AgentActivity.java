package com.amosley.base;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * The agent chat sheet. A second, transparent Capacitor bridge that opens
 * agent.html over whatever app you're in. Same origin as the main app, so it
 * reads and writes the same BASE data (localStorage).
 */
public class AgentActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BaseAgentPlugin.class);
        config = agentConfig();
        super.onCreate(savedInstanceState);
        getWindow().setFormat(PixelFormat.TRANSLUCENT);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        if (getBridge() != null) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.setBackgroundColor(Color.TRANSPARENT);
                webView.setVerticalScrollBarEnabled(false);
                webView.setHorizontalScrollBarEnabled(false);
            }
        }
    }

    /** BridgeActivity forces its opaque theme; keep the translucent one. */
    @Override
    public void setTheme(int resid) {
        super.setTheme(R.style.AppTheme_Agent);
    }

    /** The bundled capacitor.config.json, pointed at agent.html, no splash. */
    private CapConfig agentConfig() {
        try (InputStream in = getAssets().open("capacitor.config.json")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            JSONObject json = new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));

            JSONObject server = json.optJSONObject("server");
            if (server == null) server = new JSONObject();
            // Appended straight onto "https://localhost", so it needs the leading slash.
            server.put("appStartPath", "/agent.html");
            json.put("server", server);

            JSONObject android = json.optJSONObject("android");
            if (android == null) android = new JSONObject();
            android.put("backgroundColor", "#00000000");
            json.put("android", android);

            JSONObject plugins = json.optJSONObject("plugins");
            if (plugins == null) plugins = new JSONObject();
            JSONObject splash = plugins.optJSONObject("SplashScreen");
            if (splash == null) splash = new JSONObject();
            splash.put("launchShowDuration", 0);
            splash.put("launchAutoHide", true);
            plugins.put("SplashScreen", splash);
            json.put("plugins", plugins);

            return new CapConfig(getAssets(), json);
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        BaseAgentService.setAgentOpen(true);
    }

    @Override
    public void onStop() {
        super.onStop();
        BaseAgentService.setAgentOpen(false);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    @SuppressWarnings("deprecation")
    void close() {
        finish();
        overridePendingTransition(0, 0);
    }
}
