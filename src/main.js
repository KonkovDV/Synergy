import { App } from './app.js';

const app = new App(document.getElementById('app'));
// 5.14 — a host may open a given exercise (?game=…&level=…); without a finished onboarding the safety pages come first.
if (app.launch?.game && app.profile.onboarded) app.go('play', { game: app.launch.game, level: app.launch.level });
else app.go('home');

if ('serviceWorker' in navigator && location.protocol !== 'file:' && document.documentElement.dataset.build === 'dist') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
