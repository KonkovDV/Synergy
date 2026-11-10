package android.net;
public abstract class Uri implements android.os.Parcelable {
  public abstract String getScheme();
  public abstract String getHost();
  public String getQueryParameter(String key) { return null; }
}
