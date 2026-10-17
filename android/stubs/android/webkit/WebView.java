package android.webkit;
public class WebView extends android.widget.AbsoluteLayout {
  public WebView(android.content.Context c) { super(c); }
  public WebSettings getSettings() { return null; }
  public void setWebChromeClient(WebChromeClient c) {}
  public void loadUrl(String url) {}
  public WebBackForwardList restoreState(android.os.Bundle b) { return null; }
  public WebBackForwardList saveState(android.os.Bundle b) { return null; }
  public void evaluateJavascript(String script, ValueCallback<String> cb) {}
}
