/**
 * Stream overlay page served by OverlayService.
 * Transparent background so it sits on top of the stream as a browser source
 * (or ?bg=<hex> for a solid one, e.g. when window-capturing the desktop app).
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
  /*
   * Built for a small square in a corner of the stream. Everything is sized in rem off
   * a viewport-scaled root, so shrinking the window shrinks the whole overlay evenly
   * instead of cutting anything off. The three cards split the height equally.
   */
  html { font-size: 4vmin; }
  html, body { margin: 0; width: 100%; height: 100%; background: transparent; }
  body {
    font: 600 1rem/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: var(--text);
    padding: 0.6rem;
    display: grid;
    grid-template-rows: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
    overflow: hidden;
  }
  .card {
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 0.7rem;
    padding: 0.6rem 0.8rem;
    backdrop-filter: blur(6px);
  }
  .label {
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-2);
    margin-bottom: 0.25rem;
    display: flex;
    justify-content: space-between;
  }
  .label .more { color: var(--muted); letter-spacing: 0.05em; }
  .meta { display: flex; justify-content: space-between; gap: 0 0.6rem; color: var(--muted); font-size: 0.7rem; margin-top: 0.3rem; }
  .meta > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #now-time { flex-shrink: 0; }
  .now-row { display: flex; align-items: center; gap: 0.55rem; min-width: 0; }
  .now-text { flex: 1; min-width: 0; }
  #now-art {
    width: 2.8rem;
    height: 2.8rem;
    flex-shrink: 0;
    object-fit: cover;
    border-radius: 0.35rem;
    background: var(--line);
  }
  .bar { height: 0.3rem; border-radius: 0.15rem; background: var(--line); margin-top: 0.45rem; overflow: hidden; }
  .bar > div { height: 100%; width: 0; background: linear-gradient(90deg, var(--accent-2), var(--accent)); transition: width 1s linear; }
  #now-title {
    font-size: 1.1rem;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  #info { gap: 0.45rem; font-size: 0.85rem; }
  .reply {
    white-space: pre-line;
    font-weight: 500;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    animation: in 0.25s ease-out;
  }
  .reply .user { color: var(--accent); font-weight: 700; }
  ol { margin: 0; padding: 0; list-style-position: inside; }
  li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0.05rem 0; }
  li .by { color: var(--muted); font-weight: 500; }
  #next-empty { color: var(--muted); }
  /* How to request a song — always on screen */
  #hint {
    border-color: var(--accent);
    font-size: 1.3rem;
    line-height: 1.25;
    text-align: center;
  }
  #hint b { color: var(--accent-2); }
  #hint .example { color: var(--muted); font-weight: 500; font-size: 0.8rem; margin-top: 0.3rem; }
  .hidden { display: none; }
  @keyframes in { from { opacity: 0; transform: translateY(4px); } }
</style>
</head>
<body>
  <div class="card" id="now">
    <div class="label" id="now-label">Now playing</div>
    <div class="now-row">
      <img class="hidden" id="now-art" alt="">
      <div class="now-text">
        <div id="now-title"></div>
        <div class="meta"><span id="now-by"></span><span id="now-time"></span></div>
      </div>
    </div>
    <div class="bar"><div id="now-bar"></div></div>
  </div>

  <div class="card" id="info">
    <div class="hidden" id="replies"></div>

    <div id="next">
      <div class="label">Up next <span class="more hidden" id="next-more"></span></div>
      <ol id="next-list"></ol>
      <div class="hidden" id="next-empty">Nothing queued yet</div>
    </div>
  </div>

  <div class="card" id="hint">
    <div>Type <b>!play &lt;song&gt;</b></div>
    <div>to request a song</div>
    <div class="example">e.g. !play goodbyes post malone</div>
  </div>

<script>
  const REPLY_SECONDS = 20;
  // Kept small so the middle card's content fits a third of the square
  const MAX_SHOWN_NEXT = 3;
  const MAX_SHOWN_NEXT_WITH_REPLY = 2;
  const $ = (id) => document.getElementById(id);

  // ?bg=<hex> gives a solid background for captures that drop transparency
  const bg = new URLSearchParams(location.search).get('bg');
  if (bg && /^[0-9a-f]{3,8}$/i.test(bg)) document.body.style.background = '#' + bg;

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  // Hide the art if the image can't be loaded
  $('now-art').addEventListener('error', () => $('now-art').classList.add('hidden'));

  /** Show the album art, only reloading it when the song's art changes */
  function renderArt(src) {
    const img = $('now-art');
    if (img.dataset.src !== (src || '')) {
      img.dataset.src = src || '';
      if (src) {
        img.src = src;
        img.classList.remove('hidden');
      } else {
        img.removeAttribute('src');
        img.classList.add('hidden');
      }
    }
  }

  function render(state) {
    const now = state.now;
    renderArt(now && now.artwork);
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

    // Only the latest reply is shown
    const fresh = state.replies
      .filter((r) => state.serverTime - r.at < REPLY_SECONDS * 1000)
      .slice(0, 1);

    const list = $('next-list');
    const shownNext = state.upNext.slice(0, fresh.length ? MAX_SHOWN_NEXT_WITH_REPLY : MAX_SHOWN_NEXT);
    list.replaceChildren(...shownNext.map((item) => {
      const li = document.createElement('li');
      const by = document.createElement('span');
      by.className = 'by';
      by.textContent = ' — @' + item.requestedBy;
      li.append(item.title, by);
      return li;
    }));
    $('next-empty').classList.toggle('hidden', shownNext.length > 0);
    const extra = state.queueLength - shownNext.length;
    $('next-more').textContent = '+' + extra + ' more';
    $('next-more').classList.toggle('hidden', extra <= 0);

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
