package android.app;
public class Activity extends android.content.Context {
  protected void onCreate(android.os.Bundle b) {}
  protected void onSaveInstanceState(android.os.Bundle b) {}
  public void onBackPressed() {}
  public android.view.Window getWindow() { return null; }
  public void setContentView(android.view.View v) {}
  public final void runOnUiThread(Runnable r) {}
  public void finish() {}
}
