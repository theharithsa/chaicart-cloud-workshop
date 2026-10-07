(() => {
  const guide = location.pathname.endsWith("facilitator-guide.html");
  const title = document.title.split("–")[0].trim();
  if (!guide) {
    const hint = document.querySelector(".toolbar .hint");
    if (hint)
      hint.textContent =
        "Read on screen or print an optional reference copy. Student submissions happen in ChaiCart Live.";
  }
  const banner = document.createElement("aside");
  banner.className = "reference-banner";
  const strong = document.createElement("strong");
  strong.textContent = guide
    ? "Facilitator reference"
    : "Optional reference · Not the live workshop";
  const text = document.createElement("span");
  text.textContent = guide
    ? "Use the flow map for the next action; read the detailed sections here for preparation. "
    : "Students submit answers, receive credits and access certificates in ChaiCart Live. This page is a reference; printing is optional. ";
  const link = document.createElement("a");
  link.href = guide
    ? "workshop-flow.html"
    : "https://gmu.inspi.in/";
  link.textContent = guide ? "Open the flow map →" : "Open ChaiCart Live →";
  banner.append(strong, text, link);
  const toolbar = document.querySelector(".toolbar");
  if (toolbar) toolbar.after(banner);
  else document.body.prepend(banner);
  document.querySelectorAll(".page table").forEach((table) => {
    const wrap = document.createElement("div");
    wrap.className = "table-scroll";
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Scrollable reference table");
    table.before(wrap);
    wrap.append(table);
  });
  const headings = [...document.querySelectorAll(".page h1,.deck-title .dt-h")];
  if (headings.length > 1) {
    const nav = document.createElement("nav");
    nav.className = "reader-jump";
    nav.setAttribute("aria-label", title + " sections");
    const label = document.createElement("label");
    label.htmlFor = "section-jump";
    label.textContent = "Jump to a section";
    const select = document.createElement("select");
    select.id = "section-jump";
    select.add(new Option("Choose a section…", ""));
    headings.forEach((heading, i) => {
      if (!heading.id) heading.id = "reference-section-" + i;
      select.add(new Option(heading.textContent.trim(), heading.id));
    });
    select.addEventListener("change", () => {
      if (select.value) {
        const heading = document.getElementById(select.value);
        heading.scrollIntoView();
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        history.replaceState(null, "", "#" + select.value);
      }
    });
    nav.append(label, select);
    banner.after(nav);
  }
})();
