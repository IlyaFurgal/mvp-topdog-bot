import { NavLink } from 'react-router-dom'

const tabs = [
  { path: '/ai',        label: 'ИИ'      },
  { path: '/trackers',  label: 'ТРЕКЕР'  },
  { path: '/progress',  label: 'ПРОГРЕСС' },
  { path: '/knowledge', label: 'БАЗА'     },
  { path: '/residents', label: 'ЧАТ'      },
  { path: '/profile',   label: 'ПРОФИЛЬ'  },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
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
