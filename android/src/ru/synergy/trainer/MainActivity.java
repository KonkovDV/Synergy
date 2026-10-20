package ru.synergy.trainer;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
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
import android.widget.Toast;
import java.io.IOException;
import java.io.OutputStream;
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
    private static final int INLINE_SHARE_CHARS = 200 * 1024; // UTF-16 in the intent: well under the 1 MB binder limit
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
        // 5.16: transparent until the page paints its own background — the splash of the window theme (the Firebird
        // on the light background, res/drawable/splash.xml) stays visible instead of a white WebView.
        view.setBackgroundColor(0);
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
    /** Android 10+: a file of our own in the public Downloads folder, no storage permission needed (MediaStore). */
    private Uri saveToDownloads(String name, String mime, String body) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Synergy");
        ContentResolver resolver = getContentResolver();
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("MediaStore insert failed");
        OutputStream out = resolver.openOutputStream(uri);
        if (out == null) throw new IOException("no output stream");
        try { out.write(body.getBytes("UTF-8")); } finally { out.close(); }
        return uri;
    }

    public final class NativeBridge {
        @JavascriptInterface
        public void speak(String text, boolean interrupt) {
            if (!ttsReady || text == null) return;
            String phrase = text.length() > 400 ? text.substring(0, 400) : text;
            tts.speak(phrase, interrupt ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, "synergy");
        }

        @JavascriptInterface
        public void stop() { if (ttsReady) tts.stop(); }

        /** The system dark theme (5.12): a WebView of an app targeting API 29 does not pass it to prefers-color-scheme. */
        @JavascriptInterface
        public boolean nightMode() {
            return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        }

        /**
         * Share sheet for a text file (JSON/CSV/HTML): mail, messenger, cloud drive. A large file (a long history) is
         * first saved to «Загрузки/Synergy» and shared as a file (5.11, Red Team: up to 4M characters in EXTRA_TEXT
         * exceeded the 1 MB binder limit — TransactionTooLargeException closed the app, and long-term users, who
         * need a backup most, could not make one). Any failure is a message, never a crash.
         */
        @JavascriptInterface
        public void share(final String name, final String mime, final String body) {
            if (body == null || body.length() > MAX_SHARE_CHARS) return;
            final String file = name == null ? "synergy.txt" : name;
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.putExtra(Intent.EXTRA_SUBJECT, file);
                        if (body.length() <= INLINE_SHARE_CHARS) {
                            send.setType("text/plain");
                            send.putExtra(Intent.EXTRA_TEXT, body);
                        } else if (Build.VERSION.SDK_INT >= 29) {
                            Uri saved = saveToDownloads(file, mime == null ? "text/plain" : mime, body);
                            send.setType(mime == null ? "text/plain" : mime);
                            send.putExtra(Intent.EXTRA_STREAM, saved);
                            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            Toast.makeText(MainActivity.this, "Файл сохранён в «Загрузки/Synergy»: " + file, Toast.LENGTH_LONG).show();
                        } else {
                            Toast.makeText(MainActivity.this, "Файл слишком большой для отправки на этой версии Android", Toast.LENGTH_LONG).show();
                            return;
                        }
                        startActivity(Intent.createChooser(send, "Отправить: " + file));
                    } catch (RuntimeException | IOException e) {
                        Toast.makeText(MainActivity.this, "Не удалось отправить файл", Toast.LENGTH_LONG).show();
                    }
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
