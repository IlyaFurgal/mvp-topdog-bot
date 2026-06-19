import client from './client'

export async function getWorkoutCategories() {
  const { data } = await client.get('/workouts/categories')
  return data
}

export async function getWorkoutItems(category_id) {
  const { data } = await client.get('/workouts/items', { params: { category_id } })
  return data
}

export async function createWorkoutItem(category_id, name) {
  const { data } = await client.post('/workouts/items', { category_id, name })
  return data
}

export async function createWorkout(body) {
  const { data } = await client.post('/workouts', body)
  return data
}

export async function getWorkouts(from, to) {
  const params = {}
  if (from) params.from = from
  if (to) params.to = to
  const { data } = await client.get('/workouts', { params })
  return data
}

export async function updateWorkout(id, body) {
  const { data } = await client.put(`/workouts/${id}`, body)
  return data
}

export async function deleteWorkout(id) {
  await client.delete(`/workouts/${id}`)
}
