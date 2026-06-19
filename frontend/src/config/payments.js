export const PAYMENT_URLS = {
  plus1m: 'https://topdog-mvp.ru/plus1',
  pro1m:  'https://topdog-mvp.ru/pro1',
}

export function openPaymentLink(url) {
  if (window.Telegram?.WebApp?.openLink) {
    window.Telegram.WebApp.openLink(url)
  } else {
    window.open(url, '_blank', 'noopener')
  }
}
