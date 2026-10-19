package android.content;
public abstract class Context {
  public static final String PRINT_SERVICE = "print";
  public abstract Object getSystemService(String name);
  public abstract void startActivity(Intent intent);
  public abstract ContentResolver getContentResolver();
  public android.content.res.Resources getResources() { return null; }
}
