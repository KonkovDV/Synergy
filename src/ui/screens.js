// Screen registry: name → (app, params) => { node, tick?, cleanup? }.
import { homeScreen, levelsScreen } from './home.js';
import { playScreen } from './play.js';
import { resultsScreen, restScreen } from './results.js';
import { progressScreen } from './progress.js';
import { settingsScreen, calibrationScreen } from './settings.js';
import { onboardingScreen } from './onboarding.js';

export const SCREENS = {
  home: homeScreen,
  levels: levelsScreen,
  play: playScreen,
  results: resultsScreen,
  rest: restScreen,
  progress: progressScreen,
  settings: settingsScreen,
  calibration: calibrationScreen,
  onboarding: onboardingScreen,
};
