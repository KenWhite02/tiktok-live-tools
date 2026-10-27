/**
 * Test console served by OverlayService at /console.
 * Sends fake chat to /simulate so commands can be rehearsed without going live,
 * and shows the same /state the overlay polls.
 */
export const CONSOLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test Console</title>
<style>
  :root {
    --bg: #0e0e13;
    --card: #17171f;
    --text: #f5f5f7;
    --muted: #a1a1aa;
    --accent: #fe2c55;
    --accent-2: #25f4ee;
    --line: rgba(255, 255, 255, 0.1);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--text); }
  body { font: 500 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 16px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
  .label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent-2); margin-bottom: 6px; }
  form { display: flex; gap: 8px; }
  input[type=text] {
    flex: 1; min-width: 0; font: inherit; color: var(--text); background: var(--bg);
    border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px;
  }
  input[type=text]:focus { outline: 2px solid var(--accent-2); outline-offset: -1px; }
  button {
    font: inherit; font-weight: 600; color: var(--text); background: var(--bg);
    border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; cursor: pointer;
  }
  button:hover { border-color: var(--accent-2); }
  button.primary { background: var(--accent); border-color: var(--accent); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
  .row label { color: var(--muted); display: flex; align-items: center; gap: 6px; }
  #nickname { flex: 0 1 160px; }
  #status { color: var(--muted); font-size: 12px; margin-top: 8px; min-height: 1.4em; }
  #status.error { color: var(--accent); }
  .title { font-size: 16px; font-weight: 700; }
  .muted { color: var(--muted); }
  ol { margin: 0; padding-left: 20px; }
  .reply + .reply { border-top: 1px solid var(--line); margin-top: 6px; padding-top: 6px; }
  .reply { white-space: pre-line; }
  .reply .user { color: var(--accent); font-weight: 700; }
</style>
</head>
<body>
  <div class="card">
    <div class="label">Send chat</div>
    <form id="send">
      <input type="text" id="message" placeholder="!play goodbyes post malone" autocomplete="off" autofocus>
      <button class="primary" type="submit">Send</button>
    </form>
    <div class="row">
      <label>as <input type="text" id="nickname" value="Kaneki"></label>
      <label><input type="checkbox" id="host" checked> host / mod (no cooldown)</label>
    </div>
    <div class="row" id="quick">
      <button type="button">!skip</button>
      <button type="button">!np</button>
      <button type="button">!queue</button>
      <button type="button">!pause</button>
      <button type="button">!resume</button>
      <button type="button">!clear</button>
      <button type="button">!help</button>
    </div>
    <div id="status"></div>
  </div>

  <div class="card">
    <div class="label">Now playing</div>
    <div class="title" id="now">Nothing playing</div>
    <div class="muted" id="now-meta"></div>
  </div>

  <div class="card">
    <div class="label">Queue</div>
    <ol id="queue"></ol>
    <div class="muted" id="queue-empty">Empty</div>
  </div>

  <div class="card">
    <div class="label">Bot replies</div>
    <div id="replies" class="muted">None yet</div>
  </div>

<script>
  const $ = (id) => document.getElementById(id);
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  function setStatus(text, isError) {
    $('status').textContent = text;
    $('status').classList.toggle('error', !!isError);
  }

  async function send(message) {
    message = message.trim();
    if (!message) return;
    try {
      const res = await fetch('/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, nickname: $('nickname').value, host: $('host').checked }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setStatus('Sent: ' + message);
      setTimeout(poll, 300);
    } catch (err) {
      setStatus('Could not send (' + err.message + ') — is the bot running?', true);
    }
  }

  $('send').addEventListener('submit', (e) => {
    e.preventDefault();
    send($('message').value);
    $('message').value = '';
  });
  $('quick').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') send(e.target.textContent);
  });

  function render(state) {
    const now = state.now;
    $('now').textContent = now ? now.title : 'Nothing playing';
    $('now-meta').textContent = now
      ? (now.paused ? 'Paused · ' : '') + 'requested by ' + now.requestedBy + ' · ' + fmt(now.position) + ' / ' + fmt(now.duration)
      : '';

    $('queue').replaceChildren(...state.upNext.map((item) => {
      const li = document.createElement('li');
      li.textContent = item.title + ' — @' + item.requestedBy;
      return li;
    }));
    const extra = state.queueLength - state.upNext.length;
    $('queue-empty').textContent = state.queueLength === 0 ? 'Empty' : extra > 0 ? '+ ' + extra + ' more' : '';

    const box = $('replies');
    const key = state.replies.map((r) => r.at).join(',');
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      box.classList.toggle('muted', state.replies.length === 0);
      if (state.replies.length === 0) {
        box.textContent = 'None yet';
      } else {
        box.replaceChildren(...state.replies.map((r) => {
          const div = document.createElement('div');
          div.className = 'reply';
          const user = document.createElement('span');
          user.className = 'user';
          user.textContent = '@' + r.user + ' ';
          div.append(user, r.text);
          return div;
        }));
      }
    }
  }

  let timer;
  async function poll() {
    clearTimeout(timer);
    try {
      const res = await fetch('/state', { cache: 'no-store' });
      if (res.ok) render(await res.json());
    } catch {
      // Bot restarting — try again
    }
    timer = setTimeout(poll, 1000);
  }
  poll();
</script>
</body>
</html>
`;
