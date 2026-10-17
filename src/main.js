import { App } from './app.js';

const app = new App(document.getElementById('app'));
app.go('home');

if ('serviceWorker' in navigator && location.protocol !== 'file:' && document.documentElement.dataset.build === 'dist') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
