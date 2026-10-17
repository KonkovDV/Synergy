package android.content;
public class Intent {
  public static final String ACTION_SEND = "android.intent.action.SEND";
  public static final String EXTRA_TEXT = "android.intent.extra.TEXT";
  public static final String EXTRA_SUBJECT = "android.intent.extra.SUBJECT";
  public Intent(String action) {}
  public Intent setType(String type) { return this; }
  public Intent putExtra(String name, String value) { return this; }
  public static Intent createChooser(Intent target, CharSequence title) { return target; }
}
