import client from './client'

export async function getSavedMessages() {
  const { data } = await client.get('/saved-messages')
  return data
}

export async function createSavedMessage(text) {
  const { data } = await client.post('/saved-messages', { text })
  return data
}

export async function deleteSavedMessage(id) {
  await client.delete(`/saved-messages/${id}`)
}
