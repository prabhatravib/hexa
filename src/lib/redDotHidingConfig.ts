/**
 * Red Dot Hiding Configuration
 *
 * This feature swaps the microphone track with a silent track when voice is disabled,
 * which releases the microphone hardware and removes the browser's red dot indicator.
 *
 * To disable this feature if it causes any issues:
 * 1. Set RED_DOT_HIDING_ENABLED to false
 * 2. Or comment out the red dot hiding code in useVoiceDisableEffects.ts
 */

export const RED_DOT_HIDING_ENABLED = true;

/**
 * Logs the current status of red dot hiding feature
 */
export const logRedDotHidingStatus = () => {
  console.log(`[red-dot] Feature status: ${RED_DOT_HIDING_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  if (RED_DOT_HIDING_ENABLED) {
    console.log('  - Microphone will be released when voice is OFF');
    console.log('  - Browser red dot will disappear when voice is OFF');
    console.log('  - Session will remain connected');
  } else {
    console.log('  - Red dot hiding is disabled');
    console.log('  - Browser red dot will persist when voice is OFF');
  }
};
