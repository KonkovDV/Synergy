// Example host (docs/embed/README.md, «Unity»): «Синергия» in a WebView over your Unity scene. Unity has no WebView of
// its own on Android and iOS — this uses the open plugin gree/unity-webview (WebViewObject). Its JS bridge
// window.Unity.call(text) is a channel the page knows: Init(cb: …) hears every message, no script to inject.
using System;
using System.Globalization;
using UnityEngine;

public class SynergyHost : MonoBehaviour
{
    [Serializable]
    class Message
    {
        public string type; public int protocol; public bool onboarded; public string game; public int level;
        public int score; public int stars; public string reason; // other fields are skipped by JsonUtility
    }

    [Tooltip("The web build of «Синергии» (dist/): your https address, or a file under StreamingAssets")]
    public string url = "https://example.org/synergy/index.html";
    public string game = "grip";

    WebViewObject web;
    bool started;

    void Start()
    {
        web = new GameObject("SynergyWebView").AddComponent<WebViewObject>();
        web.Init(cb: OnMessage, ld: OnLoaded);
        web.SetMargins(0, 0, 0, 0);
        web.SetVisibility(true);
        web.LoadURL(url);
    }

    /// After the page loaded: some versions of the plugin define window.Unity.call on iOS only through a script — define
    /// it if missing, then ask «Синергию» again whether it is up (synergy-ping → synergy:ready).
    void OnLoaded(string url)
    {
        web.EvaluateJS("if(!(window.Unity&&window.Unity.call)&&window.webkit&&webkit.messageHandlers&&webkit.messageHandlers.unityControl)" +
            "{window.Unity={call:function(m){webkit.messageHandlers.unityControl.postMessage(m)}}}" +
            "window.postMessage({type:'synergy-ping'},'*')");
    }

    /// Every message is one JSON string (services/host.js).
    void OnMessage(string json)
    {
        Message m;
        try { m = JsonUtility.FromJson<Message>(json); } catch (ArgumentException) { return; }
        if (m == null || m.protocol != 1) return;
        switch (m.type)
        {
            case "synergy:ready":
                // The game is up: open the exercise (after the safety onboarding on the very first run).
                if (!started) { started = true; web.EvaluateJS($"window.Synergy.start('{Safe(game)}', 1)"); }
                break;
            case "synergy:result":
                Debug.Log($"Синергия: {m.game}, уровень {m.level}: {m.score} из 100, звёзд {m.stars}");
                break;
            case "synergy:close":
                web.SetVisibility(false); // the person is done: back to your scene
                break;
        }
    }

    /// Call from your prosthesis SDK or sensor callback: one frame, values 0…1 (docs/INTEGRATION.md).
    public void PushFrame(float a, float b)
    {
        if (web == null) return;
        var inv = CultureInfo.InvariantCulture;
        web.EvaluateJS($"window.Synergy&&window.Synergy.feed({{a:{a.ToString(inv)},b:{b.ToString(inv)}}})");
    }

    static string Safe(string id)
    {
        var chars = Array.FindAll(id.ToCharArray(), c => c >= 'a' && c <= 'z');
        return new string(chars);
    }

    void OnDestroy()
    {
        if (web != null) Destroy(web.gameObject);
    }
}
