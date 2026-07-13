import { NavLink, useLocation } from 'react-router-dom'

const tabs = [
  { path: '/ai',      label: 'ЧАТ'     },
  { path: '/profile', label: 'ПРОФИЛЬ' },
  { path: '/club',    label: 'КЛУБ'    },
]

export default function TopNav() {
  const location = useLocation()

  return (
    <nav className="top-nav">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}
          onClick={() => {
            // Clicking the tab you're already on doesn't trigger a route
            // change, so a page's own internal sub-view state (e.g.
            // ProfilePage's МОИ ДАННЫЕ / tracker sub-screens) never resets —
            // the tab just looked dead. Broadcast a reset so the active
            // page can pop itself back to its top-level view.
            if (location.pathname === tab.path) {
              window.dispatchEvent(new CustomEvent('topnav-reset', { detail: tab.path }))
            }
          }}
        >
          <span className="nav-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
