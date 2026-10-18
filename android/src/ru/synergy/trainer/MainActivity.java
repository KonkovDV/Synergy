package ru.synergy.trainer;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.speech.tts.TextToSpeech;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.util.Locale;

/**
 * Thin native shell: the game itself is the offline web build in assets/www.
 * Integration point for a real prosthesis / Motorica SDK: call pushFrame(a, b, gesture)
 * from the SDK callback — it forwards the SignalFrame to window.Synergy.feed (docs/INTEGRATION.md).
 * window.SynergyNative (only our own bundled pages can reach it — external navigation is blocked):
 * speak/stop (TextToSpeech: WebView has no Web Speech API), share (reports, backups), print (PDF).
 */
public class MainActivity extends Activity {
    private static final String ASSETS = "file:///android_asset/";
    private static final int MAX_SHARE_CHARS = 4 * 1024 * 1024;
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady;
    private WebView printPage; // kept referenced until the print job has its document

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = createGameView();
        setContentView(web);
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            public void onInit(int status) {
                ttsReady = status == TextToSpeech.SUCCESS;
                if (ttsReady) tts.setLanguage(new Locale("ru", "RU"));
            }
        });
        if (state == null) web.loadUrl(ASSETS + "www/index.html");
        else web.restoreState(state);
    }

    private WebView createGameView() {
        WebView view = new WebView(this);
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); // android_asset still loads; no access to other local files
        s.setAllowContentAccess(false); // nor to content:// providers
        s.setMediaPlaybackRequiresUserGesture(false);
        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return url == null || !url.startsWith(ASSETS); // stay inside the bundled game
            }

            /** RT-8 (API 26+): the renderer died (low memory on a weak phone) — start a new view, not a crash. */
            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                if (v != web) return true;
                web = createGameView();
                setContentView(web); // detaches the dead view; progress is in localStorage
                v.destroy();
                web.loadUrl(ASSETS + "www/index.html");
                return true;
            }
        });
        view.addJavascriptInterface(new NativeBridge(), "SynergyNative");
        return view;
    }

    /** Forward one EMG frame from a native source (BLE prosthesis, SDK) into the game. */
    public void pushFrame(final float a, final float b, final String gesture) {
        final String g = gesture == null ? "" : ",gesture:'" + gesture.replaceAll("[^a-z]", "") + "'";
        runOnUiThread(new Runnable() {
            public void run() { web.evaluateJavascript("window.Synergy&&window.Synergy.feed({a:" + a + ",b:" + b + g + "})", null); }
        });
    }

    /** Methods visible to the bundled JavaScript as window.SynergyNative. Called on a binder thread. */
    public final class NativeBridge {
        @JavascriptInterface
        public void speak(String text, boolean interrupt) {
            if (!ttsReady || text == null) return;
            String phrase = text.length() > 400 ? text.substring(0, 400) : text;
            tts.speak(phrase, interrupt ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, "synergy");
        }

        @JavascriptInterface
        public void stop() { if (ttsReady) tts.stop(); }

        /** Share sheet for a text file (JSON/CSV/HTML): mail, messenger, cloud drive. */
        @JavascriptInterface
        public void share(final String name, final String mime, final String body) {
            if (body == null || body.length() > MAX_SHARE_CHARS) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_SUBJECT, name == null ? "Синергия" : name);
                    send.putExtra(Intent.EXTRA_TEXT, body);
                    startActivity(Intent.createChooser(send, "Отправить: " + name));
                }
            });
        }

        /** System print dialog for the specialist report: «Save as PDF» or a printer. */
        @JavascriptInterface
        public void print(final String title, final String html) {
            if (html == null || html.length() > MAX_SHARE_CHARS) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    printPage = new WebView(MainActivity.this);
                    printPage.setWebViewClient(new WebViewClient() {
                        private boolean sent;

                        @Override
                        public boolean shouldOverrideUrlLoading(WebView view, String url) { return true; }

                        @Override
                        public void onPageFinished(WebView view, String url) {
                            if (sent) return;
                            sent = true;
                            PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                            pm.print(title, view.createPrintDocumentAdapter(title), new PrintAttributes.Builder().build());
                        }

                        @Override
                        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                            if (view == printPage) printPage = null; // the report page died: drop it, the game goes on
                            view.destroy();
                            return true;
                        }
                    });
                    printPage.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                }
            });
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.Synergy&&window.Synergy.back())?'1':'0'", new ValueCallback<String>() {
            public void onReceiveValue(String handled) {
                if (!"\"1\"".equals(handled)) finish();
            }
        });
    }
}
