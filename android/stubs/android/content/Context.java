package android.content;
public abstract class Context {
  public static final String PRINT_SERVICE = "print";
  public abstract Object getSystemService(String name);
  public abstract void startActivity(Intent intent);
}
