package android.content;
public class Intent {
  public static final String ACTION_SEND = "android.intent.action.SEND";
  public static final String EXTRA_TEXT = "android.intent.extra.TEXT";
  public static final String EXTRA_SUBJECT = "android.intent.extra.SUBJECT";
  public static final String EXTRA_STREAM = "android.intent.extra.STREAM";
  public static final int FLAG_GRANT_READ_URI_PERMISSION = 1;
  public Intent(String action) {}
  public String getStringExtra(String name) { return null; }
  public int getIntExtra(String name, int defaultValue) { return defaultValue; }
  public boolean hasExtra(String name) { return false; }
  public android.net.Uri getData() { return null; }
  public Intent setType(String type) { return this; }
  public Intent putExtra(String name, String value) { return this; }
  public Intent putExtra(String name, android.os.Parcelable value) { return this; }
  public Intent addFlags(int flags) { return this; }
  public static Intent createChooser(Intent target, CharSequence title) { return target; }
}
