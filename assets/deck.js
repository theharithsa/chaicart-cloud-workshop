(() => {
  // Emoji are kept in the source for print/fun contexts but stripped on screen for a cleaner look
  const emoji =
    /(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)\s?/gu;
  const walker = document.createTreeWalker(
    document.querySelector(".deck"),
    NodeFilter.SHOW_TEXT,
  );
  for (let n; (n = walker.nextNode()); ) {
    if (!n.parentElement.closest("pre, .keep-emoji"))
      n.nodeValue = n.nodeValue.replace(emoji, "");
  }

  const slides = [...document.querySelectorAll(".slide")];
  let i = 0;

  const bar = document.createElement("div");
  bar.className = "progress";
  const counter = document.createElement("div");
  counter.className = "counter";
  const help = document.createElement("div");
  help.className = "help";
  help.textContent = "← → / space: navigate · F: fullscreen · Home/End";
  document.body.append(bar, counter, help);

  const frags = (s) => [...s.querySelectorAll(".frag")];

  function show(n, revealAll = false) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, k) => s.classList.toggle("active", k === i));
    frags(slides[i]).forEach((f) => f.classList.toggle("shown", revealAll));
    bar.style.width = ((i + 1) / slides.length) * 100 + "%";
    counter.textContent = `${i + 1} / ${slides.length}`;
    const selector = document.querySelector(".deck-controls select");
    if (selector) selector.value = String(i);
    history.replaceState(null, "", "#" + (i + 1));
  }

  function next() {
    if (document.body.classList.contains("reading")) {
      show(i + 1, true);
      slides[i].scrollIntoView();
      return;
    }
    const hidden = frags(slides[i]).filter(
      (f) => !f.classList.contains("shown"),
    );
    if (hidden.length) {
      hidden[0].classList.add("shown");
      return;
    }
    if (i < slides.length - 1) show(i + 1);
  }

  function prev() {
    if (document.body.classList.contains("reading")) {
      show(i - 1, true);
      slides[i].scrollIntoView();
      return;
    }
    const shown = frags(slides[i]).filter((f) => f.classList.contains("shown"));
    if (shown.length) {
      shown[shown.length - 1].classList.remove("shown");
      return;
    }
    if (i > 0) show(i - 1, true);
  }

  document.addEventListener("keydown", (e) => {
    if (
      e.target.closest("input, textarea, button, select") ||
      document.body.classList.contains("reading")
    )
      return;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
      case " ":
      case "PageDown":
        e.preventDefault();
        next();
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        e.preventDefault();
        prev();
        break;
      case "Home":
        show(0);
        break;
      case "End":
        show(slides.length - 1);
        break;
      case "f":
      case "F":
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
        break;
    }
  });

  document.addEventListener("click", (e) => {
    if (
      document.body.classList.contains("reading") ||
      e.target.closest(
        "a, button, input, select, .timer, .no-advance, .deck-controls",
      )
    )
      return;
    if (e.clientX < innerWidth / 4) prev();
    else next();
  });

  // Countdown timers: <div class="timer" data-timer="300"></div>
  document.querySelectorAll(".timer[data-timer]").forEach((el) => {
    const total = parseInt(el.dataset.timer, 10);
    let left = total,
      handle = null;
    const t = document.createElement("span");
    t.className = "t";
    const go = document.createElement("button");
    go.textContent = "Start";
    const reset = document.createElement("button");
    reset.textContent = "Reset";
    const lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent = "Timer";
    el.append(lbl, t, go, reset);
    const render = () => {
      t.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    };
    const stop = () => {
      clearInterval(handle);
      handle = null;
      go.textContent = "Start";
    };
    go.onclick = () => {
      if (handle) {
        stop();
        return;
      }
      go.textContent = "Pause";
      handle = setInterval(() => {
        left = Math.max(0, left - 1);
        render();
        if (left === 0) {
          stop();
          el.classList.add("done");
        }
      }, 1000);
    };
    reset.onclick = () => {
      stop();
      left = total;
      el.classList.remove("done");
      render();
    };
    render();
  });

  const controls = document.createElement("nav");
  controls.className = "deck-controls";
  controls.setAttribute("aria-label", "Presentation controls");
  const home = document.createElement("a");
  home.href = "index.html";
  home.textContent = "Workshop home";
  const back = document.createElement("button");
  back.textContent = "← Previous";
  back.onclick = prev;
  const forward = document.createElement("button");
  forward.textContent = "Next →";
  forward.onclick = next;
  const contents = document.createElement("select");
  contents.setAttribute("aria-label", "Go to slide");
  slides.forEach((s, k) =>
    contents.add(
      new Option(
        k +
          1 +
          ". " +
          (s.querySelector("h1,h2")?.textContent.trim() || "Slide " + (k + 1)),
        String(k),
      ),
    ),
  );
  contents.onchange = () => {
    show(Number(contents.value), true);
    if (document.body.classList.contains("reading")) slides[i].scrollIntoView();
  };
  const mode = document.createElement("button");
  const setMode = (reading) => {
    document.body.classList.toggle("reading", reading);
    mode.textContent = reading ? "Projector view" : "Reading view";
    mode.setAttribute("aria-pressed", String(reading));
  };
  mode.onclick = () => setMode(!document.body.classList.contains("reading"));
  setMode(matchMedia("(max-width:700px)").matches);
  controls.append(home, back, contents, forward, mode);
  document.body.prepend(controls);
  window.addEventListener("hashchange", () => {
    const n = Number(location.hash.slice(1));
    if (n >= 1 && n <= slides.length) show(n - 1, true);
  });
  const start = parseInt(location.hash.slice(1), 10);
  show(Number.isFinite(start) ? start - 1 : 0);
})();
