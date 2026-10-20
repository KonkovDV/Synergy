import { App } from './app.js';
import { loadSprites } from './ui/pictures.js';

const app = new App(document.getElementById('app'));
loadSprites(); // 5.16: pictures of the canvas (Workshop objects, gesture hands, the tutorial lock) load in the background
// A host may open a given exercise (?game=…&level=…, 5.14): `go('home')` opens it — after the safety onboarding when
// that comes first (App.pendingLaunch, 5.15). Then the host hears «ready».
app.go('home');
app.notifyReady();

if ('serviceWorker' in navigator && location.protocol !== 'file:' && document.documentElement.dataset.build === 'dist') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
