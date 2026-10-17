package android.webkit;
public class WebViewClient {
  public boolean shouldOverrideUrlLoading(WebView view, String url) { return false; }
  public void onPageFinished(WebView view, String url) {}
}
