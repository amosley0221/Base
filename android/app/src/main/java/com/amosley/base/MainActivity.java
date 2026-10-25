package com.amosley.base;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BaseAgentPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /** Opened with a page to show (e.g. "rojo.html" from Rojo's chat window). */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent == null || getBridge() == null) return;
        String path = intent.getStringExtra("path");
        if (path == null || !path.matches("[A-Za-z0-9_-]+\\.html")) return;
        intent.removeExtra("path");
        WebView webView = getBridge().getWebView();
        if (webView != null) webView.post(() -> webView.loadUrl(getBridge().getLocalUrl() + "/" + path));
    }

    @Override
    public void onStart() {
        super.onStart();
        // The grey scroll indicator is Android's native WebView scrollbar (CSS
        // can't hide it). The section-dot rail replaces it, so turn it off.
        if (getBridge() != null) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.setVerticalScrollBarEnabled(false);
                webView.setHorizontalScrollBarEnabled(false);
            }
        }
    }
}
