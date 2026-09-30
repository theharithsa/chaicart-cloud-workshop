(() => {
  // Emoji are kept in the source for print/fun contexts but stripped on screen for a cleaner look
  const emoji = /(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)\s?/gu;
  const walker = document.createTreeWalker(document.querySelector('.deck'), NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    if (!n.parentElement.closest('pre, .keep-emoji')) n.nodeValue = n.nodeValue.replace(emoji, '');
  }

  const slides = [...document.querySelectorAll('.slide')];
  let i = 0;

  const bar = document.createElement('div');
  bar.className = 'progress';
  const counter = document.createElement('div');
  counter.className = 'counter';
  const help = document.createElement('div');
  help.className = 'help';
  help.textContent = '← → / space: navigate · F: fullscreen · Home/End';
  document.body.append(bar, counter, help);

  const frags = s => [...s.querySelectorAll('.frag')];

  function show(n, revealAll = false) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, k) => s.classList.toggle('active', k === i));
    frags(slides[i]).forEach(f => f.classList.toggle('shown', revealAll));
    bar.style.width = ((i + 1) / slides.length) * 100 + '%';
    counter.textContent = `${i + 1} / ${slides.length}`;
    history.replaceState(null, '', '#' + (i + 1));
  }

  function next() {
    const hidden = frags(slides[i]).filter(f => !f.classList.contains('shown'));
    if (hidden.length) { hidden[0].classList.add('shown'); return; }
    if (i < slides.length - 1) show(i + 1);
  }

  function prev() {
    const shown = frags(slides[i]).filter(f => f.classList.contains('shown'));
    if (shown.length) { shown[shown.length - 1].classList.remove('shown'); return; }
    if (i > 0) show(i - 1, true);
  }

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, button')) return;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': e.preventDefault(); prev(); break;
      case 'Home': show(0); break;
      case 'End': show(slides.length - 1); break;
      case 'f': case 'F':
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
        break;
    }
  });

  document.addEventListener('click', e => {
    if (e.target.closest('a, button, input, .timer, .no-advance')) return;
    if (e.clientX < innerWidth / 4) prev(); else next();
  });

  // Countdown timers: <div class="timer" data-timer="300"></div>
  document.querySelectorAll('.timer[data-timer]').forEach(el => {
    const total = parseInt(el.dataset.timer, 10);
    let left = total, handle = null;
    const t = document.createElement('span'); t.className = 't';
    const go = document.createElement('button'); go.textContent = 'Start';
    const reset = document.createElement('button'); reset.textContent = 'Reset';
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = 'Timer';
    el.append(lbl, t, go, reset);
    const render = () => {
      t.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    };
    const stop = () => { clearInterval(handle); handle = null; go.textContent = 'Start'; };
    go.onclick = () => {
      if (handle) { stop(); return; }
      go.textContent = 'Pause';
      handle = setInterval(() => {
        left = Math.max(0, left - 1);
        render();
        if (left === 0) { stop(); el.classList.add('done'); }
      }, 1000);
    };
    reset.onclick = () => { stop(); left = total; el.classList.remove('done'); render(); };
    render();
  });

  const start = parseInt(location.hash.slice(1), 10);
  show(Number.isFinite(start) ? start - 1 : 0);
})();
