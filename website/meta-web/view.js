document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("[data-deck-views]");
  if (!root) return;
  const buttons = [...root.querySelectorAll(".view-toggle [data-view]")];
  const apply = (v) => {
    if (!["stacked", "list", "compact"].includes(v)) v = "stacked";
    root.dataset.view = v;
    try { localStorage.setItem("fnd-decklist-view", v); } catch {}
    buttons.forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  };
  let start = "stacked";
  try { start = localStorage.getItem("fnd-decklist-view") || "stacked"; } catch {}
  apply(start);
  buttons.forEach((b) => b.addEventListener("click", () => apply(b.dataset.view)));
});
