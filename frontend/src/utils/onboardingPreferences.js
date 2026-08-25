const FIRST_RUN_KEY = 'disruptionFirstRunDone';

export function isOnboardingTourDone() {
  try {
    return window.localStorage.getItem(FIRST_RUN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingTourDone() {
  try {
    window.localStorage.setItem(FIRST_RUN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export { FIRST_RUN_KEY };
