// Example host (docs/embed/README.md, «Flutter»): «Синергия» inside your Flutter app (webview_flutter 4.x).
// Copy dist/ of «Синергии» (npm run build) to assets/synergy/ and list the files under `flutter: assets:`.
// The JavaScriptChannel «SynergyHost» is what the page calls (window.SynergyHost.postMessage) — no script to inject.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class SynergyHost extends StatefulWidget {
  const SynergyHost({super.key, this.game = 'grip', this.onResult, this.onClose});

  final String game;
  final void Function(Map<String, dynamic> result)? onResult;
  final VoidCallback? onClose;

  @override
  State<SynergyHost> createState() => SynergyHostState();
}

class SynergyHostState extends State<SynergyHost> {
  late final WebViewController _web;
  bool _started = false;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel('SynergyHost', onMessageReceived: (m) => _onMessage(m.message))
      ..loadFlutterAsset('assets/synergy/index.html');
  }

  /// Every message is one JSON string (services/host.js).
  void _onMessage(String json) {
    final Object? m;
    try {
      m = jsonDecode(json);
    } on FormatException {
      return;
    }
    if (m is! Map<String, dynamic> || m['protocol'] != 1) return;
    switch (m['type']) {
      case 'synergy:ready':
        // The game is up: open the exercise (after the safety onboarding on the very first run).
        if (!_started) {
          _started = true;
          _web.runJavaScript('window.Synergy.start(${jsonEncode(widget.game)}, 1)');
        }
      case 'synergy:result':
        widget.onResult?.call(m);
      case 'synergy:close':
        widget.onClose?.call(); // the person is done: back to your app
    }
  }

  /// Call from your prosthesis SDK or sensor callback: one frame, values 0…1 (docs/INTEGRATION.md).
  Future<void> pushFrame(double a, double b) => _web.runJavaScript('window.Synergy&&window.Synergy.feed({a:$a,b:$b})');

  @override
  Widget build(BuildContext context) => WebViewWidget(controller: _web);
}
