const selection = document.querySelector("#selection");

document.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-choose]")?.dataset.choose;
  if (!choice) return;
  document.querySelectorAll(".concept").forEach((concept) => concept.classList.toggle("selected", concept.dataset.variant === choice));
  localStorage.setItem("amedia-design-choice", choice);
  selection.textContent = `Выбран вариант ${choice}. Напишите мне букву и любые правки.`;
});

const saved = localStorage.getItem("amedia-design-choice");
if (saved) document.querySelector(`[data-choose="${saved}"]`)?.click();
