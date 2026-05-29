import client from './client'

export async function getTodayTrackers() {
  const { data } = await client.get('/trackers/today')
  return data
}

export async function saveTracker(type, value, unit) {
  const { data } = await client.post('/trackers', { type, value, unit })
  return data
}

export async function getTrackerHistory(type, days = 30) {
  const { data } = await client.get('/trackers/history', { params: { type, days } })
  return data
}

export async function getTrackerStats(days = 30) {
  const { data } = await client.get('/trackers/stats', { params: { days } })
  return data
}

export async function updateTracker(trackerId, value) {
  const { data } = await client.patch(`/trackers/${trackerId}`, { value })
  return data
}

export async function getWeeklyInsight() {
  const { data } = await client.get('/insights/weekly')
  return data
}
