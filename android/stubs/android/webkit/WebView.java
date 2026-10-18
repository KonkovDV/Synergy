package android.webkit;
public class WebView extends android.widget.AbsoluteLayout {
  public WebView(android.content.Context c) { super(c); }
  public WebSettings getSettings() { return null; }
  public void setWebChromeClient(WebChromeClient c) {}
  public void setWebViewClient(WebViewClient c) {}
  public void addJavascriptInterface(Object object, String name) {}
  public void loadUrl(String url) {}
  public void loadDataWithBaseURL(String baseUrl, String data, String mimeType, String encoding, String historyUrl) {}
  public android.print.PrintDocumentAdapter createPrintDocumentAdapter(String documentName) { return null; }
  public WebBackForwardList restoreState(android.os.Bundle b) { return null; }
  public WebBackForwardList saveState(android.os.Bundle b) { return null; }
  public void evaluateJavascript(String script, ValueCallback<String> cb) {}
  public void destroy() {}
}
