export function useTelegram() {
  const tg = window.Telegram?.WebApp

  return {
    tg,
    user: tg?.initDataUnsafe?.user,
    initData: tg?.initData,
    expand: () => tg?.expand(),
    close: () => tg?.close(),
    colorScheme: tg?.colorScheme,
  }
}
