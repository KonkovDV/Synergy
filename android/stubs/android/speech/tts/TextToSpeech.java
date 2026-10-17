package android.speech.tts;
public class TextToSpeech {
  public static final int SUCCESS = 0;
  public static final int QUEUE_FLUSH = 0;
  public static final int QUEUE_ADD = 1;
  public interface OnInitListener { void onInit(int status); }
  public TextToSpeech(android.content.Context context, OnInitListener listener) {}
  public int speak(CharSequence text, int queueMode, android.os.Bundle params, String utteranceId) { return 0; }
  public int setLanguage(java.util.Locale loc) { return 0; }
  public int stop() { return 0; }
  public void shutdown() {}
}
