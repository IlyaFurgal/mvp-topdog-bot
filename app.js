// ── Telegram WebApp init ──────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0f0f0f');
  tg.setBackgroundColor('#0f0f0f');
}

const getUser    = () => tg?.initDataUnsafe?.user ?? null;
const getUserInitial = () => { const u = getUser(); return u?.first_name?.[0]?.toUpperCase() ?? 'U'; };
const getUserName    = () => getUser()?.first_name ?? 'Атлет';

// Stable chat_id per user (Telegram user id or random fallback)
const CHAT_ID = String(getUser()?.id ?? `anon_${Math.random().toString(36).slice(2)}`);

// ── DOM refs ──────────────────────────────────────
const welcomeScreen = document.getElementById('welcomeScreen');
const chatScreen    = document.getElementById('chatScreen');
const chatArea      = document.getElementById('chatArea');
const msgInput      = document.getElementById('msgInput');
const sendBtn       = document.getElementById('sendBtn');
const headerAvatar  = document.getElementById('headerAvatar');
const sessionDate   = document.getElementById('sessionDate');

// ── Screen transitions ────────────────────────────
function goToChat() {
  tg?.HapticFeedback?.impactOccurred('medium');
  headerAvatar.textContent = getUserInitial();
  sessionDate.textContent = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long'
  }).toUpperCase();

  welcomeScreen.classList.add('slide-out');
  setTimeout(() => {
    welcomeScreen.classList.add('hidden');
    welcomeScreen.classList.remove('slide-out');
    chatScreen.classList.remove('hidden');
    setTimeout(() => showBotGreeting(), 400);
  }, 320);
}

function goToWelcome() {
  tg?.HapticFeedback?.impactOccurred('light');
  chatScreen.classList.add('slide-out');
  setTimeout(() => {
    chatScreen.classList.add('hidden');
    chatScreen.classList.remove('slide-out');
    welcomeScreen.classList.remove('hidden');
  }, 320);
}

// ── Bot greeting ──────────────────────────────────
function showBotGreeting() {
  showTyping();
  setTimeout(() => {
    hideTyping();
    appendBotMessage(`Привет, ${getUserName()}! Я твой персональный AI-тренер MVP.\n\nЗадай мне любой вопрос — про тренировки, питание, восстановление или план дня.`);
  }, 800);
}

// ── Send to backend → Suvvy ───────────────────────
async function callSuvvy(message) {
  const res = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, chat_id: CHAT_ID }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.reply;
}

// ── Render helpers ────────────────────────────────
const timeNow = () =>
  new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

const BOT_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="#C8F135"/>
  </svg>`;

function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'msg-row user';
  row.innerHTML = `
    <div class="bubble user-bubble">
      <p>${escapeHtml(text)}</p>
      <div class="bubble-time">${timeNow()}</div>
    </div>
    <div class="avatar user-avatar">${getUserInitial()}</div>
  `;
  chatArea.appendChild(row);
  scrollBottom();
}

function appendBotMessage(text) {
  const row = document.createElement('div');
  row.className = 'msg-row bot';
  row.innerHTML = `
    <div class="avatar bot-avatar">${BOT_ICON}</div>
    <div class="bubble bot-bubble">
      <div class="bubble-label">MVP AI</div>
      <p>${escapeHtml(text)}</p>
      <div class="bubble-time">${timeNow()}</div>
    </div>
  `;
  chatArea.appendChild(row);
  scrollBottom();
}

function appendErrorMessage(text) {
  const row = document.createElement('div');
  row.className = 'msg-row bot';
  row.innerHTML = `
    <div class="avatar bot-avatar">${BOT_ICON}</div>
    <div class="bubble bot-bubble" style="border-color:#FF3B3B33">
      <div class="bubble-label" style="color:#FF3B3B">ОШИБКА</div>
      <p style="color:#888">${escapeHtml(text)}</p>
      <div class="bubble-time">${timeNow()}</div>
    </div>
  `;
  chatArea.appendChild(row);
  scrollBottom();
}

function showTyping() {
  if (document.getElementById('typingIndicator')) return;
  const row = document.createElement('div');
  row.className = 'typing-row';
  row.id = 'typingIndicator';
  row.innerHTML = `
    <div class="avatar bot-avatar">${BOT_ICON}</div>
    <div class="typing-bubble">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  chatArea.appendChild(row);
  scrollBottom();
}

function hideTyping() {
  document.getElementById('typingIndicator')?.remove();
}

// ── Send flow ─────────────────────────────────────
async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  tg?.HapticFeedback?.impactOccurred('light');
  msgInput.value = '';
  sendBtn.disabled = true;
  msgInput.disabled = true;

  appendUserMessage(text);
  showTyping();

  try {
    const reply = await callSuvvy(text);
    hideTyping();
    appendBotMessage(reply);
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (err) {
    hideTyping();
    appendErrorMessage('Не удалось получить ответ. Попробуй ещё раз.');
    console.error('Suvvy error:', err);
  } finally {
    sendBtn.disabled = false;
    msgInput.disabled = false;
    msgInput.focus();
  }
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function onInputChange() {
  sendBtn.disabled = !msgInput.value.trim();
}

function scrollBottom() {
  requestAnimationFrame(() => { chatArea.scrollTop = chatArea.scrollHeight; });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}
