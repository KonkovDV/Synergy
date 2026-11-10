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
        if (state == null) web.loadUrl(startUrl(getIntent()));
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

    /** 6.1 — a threshold of Motorica Start: a whole number 0–255 (the same pattern as services/host.js and the iPhone app). */
    static final String LEVEL_255 = "25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]";

    /**
     * 5.30 — Motorica Start opens its games by package and activity (docs/RESEARCH.md §18); a link opens one too:
     * synergy://play?game=grip&level=2&gestures=ubi4. Extras or query: game, level, gestures. Only known shapes pass —
     * a game id, a level 1–99, a gesture set — the page checks them again (services/host.js parseLaunch).
     * 6.1 — what the prosthesis app knows (Q&A of 04.11, answer 16): side (left, right) and the two thresholds
     * closeThreshold and openThreshold, 0–255, both or none. The keys are ours: question К.3 asks Motorica for theirs.
     */
    /**
     * 6.3.3 — the pair of «2 жеста + нейтраль» (answer 4г of the experts, 09.11: any two gestures): two different keys of
     * the task's dist, the closing one first — synergy://play?gestures=tz2&pair=pronation,supination. The same keys as
     * LaunchRequest.pairPattern (iPhone); the page checks the pair again (core/gesture-set.js, vocabulary.js isPair).
     */
    static final String PAIR_KEY = "flexion|extension|pronation|supination|adduction|abduction";

    static boolean isPair(String pair) {
        if (pair == null || !pair.matches("(" + PAIR_KEY + "),(" + PAIR_KEY + ")")) return false;
        int comma = pair.indexOf(',');
        return !pair.substring(0, comma).equals(pair.substring(comma + 1));
    }

    static String launchQuery(String game, String level, String gestures, String pair, String side, String closeThreshold, String openThreshold) {
        StringBuilder q = new StringBuilder();
        if (game != null && game.matches("[a-z]{2,16}")) q.append("&game=").append(game);
        if (level != null && level.matches("[1-9][0-9]?")) q.append("&level=").append(level);
        if (gestures != null && gestures.matches("tz|tz2|synergy|ubi4|spr8")) q.append("&gestures=").append(gestures);
        if (isPair(pair)) q.append("&pair=").append(pair);
        if (side != null && side.matches("left|right")) q.append("&side=").append(side);
        if (closeThreshold != null && openThreshold != null && closeThreshold.matches(LEVEL_255) && openThreshold.matches(LEVEL_255)) {
            q.append("&closeThreshold=").append(closeThreshold).append("&openThreshold=").append(openThreshold);
        }
        // self=1: the app opened its own exercise — not a host waiting for «synergy:close» (services/host.js).
        return q.length() == 0 ? "" : "?" + q.substring(1) + "&self=1";
    }

    /** A string extra, or an int extra written as text (a host may put either: putExtra("level", 2)). */
    private static String extra(Intent intent, String name) {
        String value = intent.getStringExtra(name);
        if (value == null && intent.hasExtra(name)) value = String.valueOf(intent.getIntExtra(name, -1));
        return value;
    }

    private String startUrl(Intent intent) {
        String page = ASSETS + "www/index.html";
        if (intent == null) return page;
        Uri link = intent.getData();
        if (link != null && "synergy".equals(link.getScheme())) {
            return page + launchQuery(link.getQueryParameter("game"), link.getQueryParameter("level"), link.getQueryParameter("gestures"),
                link.getQueryParameter("pair"), link.getQueryParameter("side"), link.getQueryParameter("closeThreshold"), link.getQueryParameter("openThreshold"));
        }
        return page + launchQuery(intent.getStringExtra("game"), extra(intent, "level"), intent.getStringExtra("gestures"),
            intent.getStringExtra("pair"), intent.getStringExtra("side"), extra(intent, "closeThreshold"), extra(intent, "openThreshold"));
    }

    /** A second launch (another game from the host's list, a link) while the app is open: open what it asks. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (web != null) web.loadUrl(startUrl(intent));
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

        /**
         * 5.17 — a system haptic instead of a vibration «by duration» (Android haptics principles: buzzing durations are
         * often too loud): it follows the system haptic setting and needs no VIBRATE permission. kind: "confirm" — a
         * success, "tick" — a hit or a grip change. A mistake has no haptic: REJECT is not for a game's miss.
         */
        @JavascriptInterface
        public void haptic(final String kind) {
            final int effect = "confirm".equals(kind) ? (Build.VERSION.SDK_INT >= 30 ? 16 /* CONFIRM */ : 1 /* VIRTUAL_KEY */)
                : "tick".equals(kind) ? 4 /* CLOCK_TICK */ : -1;
            if (effect < 0) return;
            runOnUiThread(new Runnable() {
                public void run() { if (web != null) web.performHapticFeedback(effect); }
            });
        }

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
