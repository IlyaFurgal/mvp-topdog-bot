import { useEffect, useState } from 'react'
import { getSavedMessages, deleteSavedMessage } from '../api/savedMessages'

function preview(text) {
  const firstLine = text.split('\n')[0]
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine
}

const MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
function fmtDate(iso) {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function SavedItem({ item, onDelete }) {
  const [open, setOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  return (
    <div className="wo-item">
      <div className="wo-item__row" onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer' }}>
        <div className="wo-item__info">
          <span className="wo-item__date">{fmtDate(item.created_at)}</span>
          <span className="wo-item__summary">{preview(item.text)}</span>
        </div>
        <div className="wo-item__actions">
          <button
            className="tracker-row__del"
            onClick={(e) => { e.stopPropagation(); setConfirmDel(true) }}
            title="Удалить"
          >🗑</button>
        </div>
      </div>
      {open && <div className="wo-item__full-text">{item.text}</div>}
      {confirmDel && (
        <div className="wo-item__confirm">
          <span className="wo-item__confirm-text">Удалить программу?</span>
          <button className="wo-item__confirm-yes" onClick={onDelete}>Да</button>
          <button className="wo-item__confirm-no" onClick={() => setConfirmDel(false)}>Нет</button>
        </div>
      )}
    </div>
  )
}

export default function SavedProgramsBlock() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try { setItems(await getSavedMessages()) } catch (_) {}
    setLoading(false)
  }

  async function handleDelete(id) {
    try {
      await deleteSavedMessage(id)
      setItems(prev => prev.filter(i => i.id !== id))
    } catch (_) {}
  }

  const shown = showAll ? items : items.slice(0, 3)

  return (
    <div className="card tracker-card">
      <div className="wo-block-header">
        <span className="tracker-row__label">СОХРАНЁННЫЕ ПРОГРАММЫ</span>
      </div>
      {loading && <p className="wo-empty">Загрузка...</p>}
      {!loading && items.length === 0 && (
        <p className="wo-empty">Сохранённых программ пока нет — сохраняй ответы ИИ в чате значком 🔖</p>
      )}
      {shown.map(i => (
        <SavedItem key={i.id} item={i} onDelete={() => handleDelete(i.id)} />
      ))}
      {items.length > 3 && (
        <button className="wo-show-all" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Свернуть ↑' : `Показать все (${items.length}) →`}
        </button>
      )}
    </div>
  )
}
