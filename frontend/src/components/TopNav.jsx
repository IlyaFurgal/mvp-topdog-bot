import { NavLink } from 'react-router-dom'

const tabs = [
  { path: '/ai',      label: 'ЧАТ'     },
  { path: '/profile', label: 'ПРОФИЛЬ' },
  { path: '/club',    label: 'КЛУБ'    },
]

export default function TopNav() {
  return (
    <nav className="top-nav">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}
        >
          <span className="nav-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
