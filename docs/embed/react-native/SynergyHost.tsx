// Example host (docs/embed/README.md, «React Native»): «Синергия» inside your React Native app (react-native-webview).
// `uri` — where the web build (dist/ of «Синергии», npm run build) is: a file in the app's bundle
// (Android: file:///android_asset/synergy/index.html) or your own https address.
// The page posts to window.ReactNativeWebView — what onMessage hears; no script to inject.
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

export type SynergyResult = {
  type: 'synergy:result'; protocol: 1; version: string; at: string; game: string; level: number; scheme: string;
  retention: boolean; score: number | null; stars: number | null; durationS: number | null; skills: Record<string, number>;
};
type SynergyMessage =
  | { type: 'synergy:ready'; protocol: 1; version: string; onboarded: boolean; games: { id: string; title: string; levels: number }[] }
  | SynergyResult
  | { type: 'synergy:close'; protocol: 1; version: string; reason: 'done' | 'back' };

export type SynergyHostHandle = {
  /** Call from your prosthesis SDK or sensor callback: one frame, values 0…1 (docs/INTEGRATION.md). */
  pushFrame(a: number, b: number): void;
};

type Props = { uri: string; game?: string; onResult?: (r: SynergyResult) => void; onClose?: () => void };

export const SynergyHost = forwardRef<SynergyHostHandle, Props>(function SynergyHost({ uri, game = 'grip', onResult, onClose }, ref) {
  // WebView<object>, not WebView: in react-native-webview 14 the default type argument is `undefined`, and under
  // `strict` its props become `never` once a ref is passed (found by the 5.15 type check).
  const web = useRef<WebView<object>>(null);
  const started = useRef(false);
  useImperativeHandle(ref, () => ({
    pushFrame: (a, b) => web.current?.injectJavaScript(`window.Synergy&&window.Synergy.feed({a:${Number(a)},b:${Number(b)}});true;`),
  }));

  /** Every message is one JSON string (services/host.js). */
  const onMessage = (e: WebViewMessageEvent) => {
    let m: SynergyMessage;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m?.protocol !== 1) return;
    if (m.type === 'synergy:ready' && !started.current) {
      // The game is up: open the exercise (after the safety onboarding on the very first run).
      started.current = true;
      web.current?.injectJavaScript(`window.Synergy.start(${JSON.stringify(game)}, 1);true;`);
    } else if (m.type === 'synergy:result') onResult?.(m);
    else if (m.type === 'synergy:close') onClose?.(); // the person is done: back to your app
  };

  return (
    <WebView
      ref={web}
      source={{ uri }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      mediaPlaybackRequiresUserAction={false}
      onMessage={onMessage}
    />
  );
});
