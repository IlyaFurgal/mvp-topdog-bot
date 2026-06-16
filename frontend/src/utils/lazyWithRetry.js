import { lazy } from 'react'

export function lazyWithRetry(importFn, retries = 3, delayMs = 500) {
  return lazy(() =>
    new Promise((resolve, reject) => {
      const attempt = (left) => {
        importFn()
          .then(resolve)
          .catch((err) => {
            if (left <= 0) {
              // последняя попытка провалилась — один hard reload (на случай устаревшего/битого чанка после деплоя)
              if (!sessionStorage.getItem('chunk_reloaded')) {
                sessionStorage.setItem('chunk_reloaded', '1')
                window.location.reload()
                return
              }
              reject(err)
              return
            }
            setTimeout(() => attempt(left - 1), delayMs)
          })
      }
      attempt(retries)
    })
  )
}
