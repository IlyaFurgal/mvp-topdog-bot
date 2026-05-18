import { createContext, useContext, useEffect, useState } from 'react'
import client from '../api/client'

const ProfileContext = createContext({
  profile: null,
  tone: 'soft',
  subscriptionType: undefined, // undefined = loading, null = no sub, "ai"|"mvp" = active
  profileLoading: true,
})

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    client
      .get('/profile/me')
      .then(({ data }) => setProfile(data))
      .catch(() => {})
      .finally(() => setProfileLoading(false))
  }, [])

  return (
    <ProfileContext.Provider
      value={{
        profile,
        tone: profile?.tone ?? 'soft',
        subscriptionType: profileLoading ? undefined : (profile?.subscription_type ?? null),
        profileLoading,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
