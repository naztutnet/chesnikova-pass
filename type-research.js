const cards = [...document.querySelectorAll(".font-option")];
const selectedBar = document.querySelector("#selectedBar");
const selectedNames = document.querySelector("#selectedNames");
const selectionCount = document.querySelector("#selectionCount");
const storageKey = "chesnikova-pass-font-shortlist";

let selected = new Set(JSON.parse(localStorage.getItem(storageKey) || "[]"));

function renderSelection() {
  cards.forEach((card) => {
    const active = selected.has(card.dataset.font);
    card.classList.toggle("selected", active);
    const button = card.querySelector(".pick");
    button.setAttribute("aria-pressed", String(active));
    button.querySelector("i").textContent = active ? "Выбрано" : "Выбрать";
  });
  const names = [...selected];
  selectedNames.textContent = names.join(", ");
  selectionCount.textContent = `${names.length} выбрано`;
  selectedBar.hidden = names.length === 0;
  localStorage.setItem(storageKey, JSON.stringify(names));
}

cards.forEach((card) => card.querySelector(".pick").addEventListener("click", () => {
  const name = card.dataset.font;
  selected.has(name) ? selected.delete(name) : selected.add(name);
  renderSelection();
}));

document.querySelector("#clearSelection").addEventListener("click", () => {
  selected.clear();
  renderSelection();
});

renderSelection();
