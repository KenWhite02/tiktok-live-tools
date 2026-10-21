/**
 * Stream overlay page served by OverlayService.
 * Transparent background so it sits on top of the stream as a browser source.
 * Polls /state every second.
 */
export const OVERLAY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Music Overlay</title>
<style>
  :root {
    --card: rgba(16, 16, 22, 0.82);
    --text: #f5f5f7;
    --muted: #a1a1aa;
    --accent: #fe2c55;
    --accent-2: #25f4ee;
    --line: rgba(255, 255, 255, 0.1);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: transparent; }
  body {
    font: 600 18px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: var(--text);
    padding: 16px;
    width: 100%;
    max-width: 460px;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 14px 16px;
    margin-bottom: 10px;
    backdrop-filter: blur(6px);
  }
  .label {
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-2);
    margin-bottom: 6px;
  }
  .title { font-size: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { display: flex; justify-content: space-between; color: var(--muted); font-size: 14px; margin-top: 4px; }
  .bar { height: 4px; border-radius: 2px; background: var(--line); margin-top: 10px; overflow: hidden; }
  .bar > div { height: 100%; width: 0; background: linear-gradient(90deg, var(--accent-2), var(--accent)); transition: width 1s linear; }
  ol { margin: 0; padding: 0; list-style-position: inside; }
  li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; padding: 2px 0; }
  li .by { color: var(--muted); font-weight: 500; }
  .more { color: var(--muted); font-size: 14px; margin-top: 4px; }
  .reply {
    white-space: pre-line;
    font-size: 15px;
    font-weight: 500;
    display: -webkit-box;
    -webkit-line-clamp: 14;
    -webkit-box-orient: vertical;
    overflow: hidden;
    animation: in 0.25s ease-out;
  }
  .reply + .reply { border-top: 1px solid var(--line); margin-top: 8px; padding-top: 8px; }
  .reply .user { color: var(--accent); font-weight: 700; }
  .hint { color: var(--muted); font-size: 14px; }
  .hint b { color: var(--text); }
  .hidden { display: none; }
  @keyframes in { from { opacity: 0; transform: translateY(4px); } }
</style>
</head>
<body>
  <div class="card" id="now">
    <div class="label" id="now-label">Now playing</div>
    <div class="title" id="now-title"></div>
    <div class="meta"><span id="now-by"></span><span id="now-time"></span></div>
    <div class="bar"><div id="now-bar"></div></div>
  </div>

  <div class="card hidden" id="next">
    <div class="label">Up next</div>
    <ol id="next-list"></ol>
    <div class="more hidden" id="next-more"></div>
  </div>

  <div class="card hidden" id="replies"></div>

  <div class="card hint">Type <b>!play &lt;song&gt;</b> to request a song</div>

<script>
  const REPLY_SECONDS = 20;
  const $ = (id) => document.getElementById(id);

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  function render(state) {
    const now = state.now;
    if (now) {
      $('now-label').textContent = now.paused ? 'Paused' : 'Now playing';
      $('now-title').textContent = now.title;
      $('now-by').textContent = 'requested by ' + now.requestedBy;
      $('now-time').textContent = fmt(now.position) + ' / ' + fmt(now.duration);
      $('now-bar').style.width = (now.duration ? Math.min(100, (now.position / now.duration) * 100) : 0) + '%';
    } else {
      $('now-label').textContent = 'Now playing';
      $('now-title').textContent = 'Nothing playing';
      $('now-by').textContent = '';
      $('now-time').textContent = '';
      $('now-bar').style.width = '0';
    }

    const list = $('next-list');
    list.replaceChildren(...state.upNext.map((item) => {
      const li = document.createElement('li');
      const by = document.createElement('span');
      by.className = 'by';
      by.textContent = ' — @' + item.requestedBy;
      li.append(item.title, by);
      return li;
    }));
    $('next').classList.toggle('hidden', state.upNext.length === 0);
    const extra = state.queueLength - state.upNext.length;
    $('next-more').textContent = '+ ' + extra + ' more';
    $('next-more').classList.toggle('hidden', extra <= 0);

    const fresh = state.replies.filter((r) => state.serverTime - r.at < REPLY_SECONDS * 1000);
    const box = $('replies');
    const key = fresh.map((r) => r.at).join(',');
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      box.replaceChildren(...fresh.map((r) => {
        const div = document.createElement('div');
        div.className = 'reply';
        const user = document.createElement('span');
        user.className = 'user';
        user.textContent = '@' + r.user + ' ';
        div.append(user, r.text);
        return div;
      }));
    }
    box.classList.toggle('hidden', fresh.length === 0);
  }

  async function poll() {
    try {
      const res = await fetch('/state', { cache: 'no-store' });
      if (res.ok) render(await res.json());
    } catch {
      // Bot restarting — keep the last state and try again
    }
    setTimeout(poll, 1000);
  }
  poll();
</script>
</body>
</html>
`;
