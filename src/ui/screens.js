// Screen registry: name → (app, params) => { node, tick?, cleanup? }.
import { homeScreen, levelsScreen } from './home.js';
import { playScreen } from './play.js';
import { resultsScreen, restScreen } from './results.js';
import { progressScreen } from './progress.js';
import { settingsScreen, calibrationScreen } from './settings.js';
import { onboardingScreen } from './onboarding.js';
import { checkinScreen } from './checkin.js';
import { tutorialScreen } from './tutorial.js';
import { pinGateScreen } from './pin.js';
import { recoveryScreen } from './recovery.js';
import { audioSyncScreen } from './audiosync.js';
import { goalsScreen } from './goals.js';
import { nestScreen } from './nest.js';
import { faqScreen } from './faq.js';
import { primerScreen } from './primer.js';

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
  checkin: checkinScreen,
  tutorial: tutorialScreen,
  pin: pinGateScreen,
  recovery: recoveryScreen,
  audiosync: audioSyncScreen,
  goals: goalsScreen,
  nest: nestScreen,
  faq: faqScreen,
  primer: primerScreen,
};
