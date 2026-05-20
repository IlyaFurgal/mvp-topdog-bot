import client from './client'

/**
 * Fire-and-forget: record that the user clicked an UPGRADE button.
 * Silently fails if user is not authenticated (e.g. on landing page).
 */
export async function trackUpgradeIntent() {
  try {
    await client.post('/profile/upgrade-intent')
  } catch {
    // not authenticated or network error — ignore
  }
}
