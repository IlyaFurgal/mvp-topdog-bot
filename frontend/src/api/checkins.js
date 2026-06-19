import client from './client'

export async function getTodayCheckins() {
  const { data } = await client.get('/checkins/today')
  return data
}

export async function saveCheckin(type, data) {
  const { data: result } = await client.post('/checkins', { type, data })
  return result
}

export async function patchCheckin(id, data) {
  const { data: result } = await client.patch(`/checkins/${id}`, { data })
  return result
}

export async function getCheckinHistory(limit = 30) {
  const { data } = await client.get('/checkins/history', { params: { limit } })
  return data
}
