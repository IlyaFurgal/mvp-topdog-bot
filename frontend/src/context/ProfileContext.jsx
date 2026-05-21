import { createContext, useContext, useEffect, useState } from 'react'
import client from '../api/client'

const ProfileContext = createContext({
  profile: null,
  tone: 'soft',
  subscriptionType: undefined,   // undefined = loading, null = no sub, "plus"|"pro" = active
  subscriptionPeriod: null,      // null | "monthly" | "biannual"
  profileLoading: true,
  refreshProfile: () => {},
})

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  async function loadProfile() {
    try {
      const { data } = await client.get('/profile/me')
      setProfile(data)
    } catch (_) {}
    setProfileLoading(false)
  }

  useEffect(() => { loadProfile() }, [])

  return (
    <ProfileContext.Provider
      value={{
        profile,
        tone: profile?.tone ?? 'soft',
        subscriptionType: profileLoading ? undefined : (profile?.subscription_type ?? null),
        subscriptionPeriod: profile?.subscription_period ?? null,
        profileLoading,
        refreshProfile: loadProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
