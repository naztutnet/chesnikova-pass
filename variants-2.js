const status = document.querySelector("#selection");
const savedRaw = localStorage.getItem("amedia-design-round-2");
let savedChoices;
try { savedChoices = JSON.parse(savedRaw || "[]"); } catch { savedChoices = savedRaw ? [savedRaw] : []; }
if (!Array.isArray(savedChoices)) savedChoices = savedChoices ? [String(savedChoices)] : [];
const choices = new Set(savedChoices);

function syncChoices() {
  document.querySelectorAll(".variant").forEach((item) => {
    const active = choices.has(item.dataset.variant);
    item.classList.toggle("selected", active);
    const button = item.querySelector("[data-choose]");
    if (button) button.textContent = active ? `Выбран ${item.dataset.variant}` : `Выбрать ${item.dataset.variant}`;
  });
  localStorage.setItem("amedia-design-round-2", JSON.stringify([...choices]));
  status.textContent = choices.size ? `Выбрано: ${[...choices].join(" + ")}. Можно добавить ещё или снять выбор.` : "Выберите один или несколько вариантов";
}

document.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-choose]")?.dataset.choose;
  if (choice) {
    if (choices.has(choice)) choices.delete(choice); else choices.add(choice);
    syncChoices();
    return;
  }

  const accentButton = event.target.closest("[data-accent]");
  if (!accentButton) return;
  const accent = accentButton.dataset.accent;
  document.documentElement.style.setProperty("--accent", accent);
  document.querySelectorAll("[data-accent]").forEach((button) => button.classList.toggle("active", button === accentButton));
  localStorage.setItem("amedia-design-accent", accent);
});

const savedAccent = localStorage.getItem("amedia-design-accent");
const accentButton = savedAccent ? document.querySelector(`[data-accent="${savedAccent}"]`) : null;
if (accentButton) accentButton.click();
syncChoices();
