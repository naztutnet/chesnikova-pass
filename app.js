import { parseFreeTextRequest } from "./free-text-parser.js";

function freshVisitor() {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    foreignCitizen: false,
  };
}

function freshDraft() {
  return {
    requestType: "single",
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    organization: "",
    room: "",
    visitors: [freshVisitor()],
  };
}

function normalizeVisitor(value = {}) {
  return {
    ...freshVisitor(),
    lastName: typeof value.lastName === "string" ? value.lastName : "",
    firstName: typeof value.firstName === "string" ? value.firstName : "",
    middleName: typeof value.middleName === "string" ? value.middleName : "",
    birthDate: typeof value.birthDate === "string" ? value.birthDate : "",
    foreignCitizen: value.foreignCitizen === true,
  };
}

function readDraft() { return freshDraft(); }

try {
  localStorage.removeItem("chesnikova-pass-draft");
  localStorage.removeItem("amedia-pass-draft");
} catch {}

const previewView = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? new URLSearchParams(window.location.search).get("view")
  : null;
const state = {
  screen: "loading",
  step: 1,
  draft: readDraft(),
  freeText: "",
  parseResult: null,
  requestStatus: "all",
  requestDate: "all",
  booting: true,
  session: null,
  requests: [],
  lastResult: null,
  submitting: false,
  loginError: "",
};

const app = document.querySelector("#app");
const tabbar = document.querySelector("#tabbar");
const backButton = document.querySelector("#backButton");
const brandLink = document.querySelector("#brandLink");
const toast = document.querySelector("#toast");
const avatar = document.querySelector(".avatar");

function haptic() {}

function saveDraft() {}

async function apiRequest(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.method && options.method !== "GET" && state.session?.csrfToken) headers["X-CSRF-Token"] = state.session.csrfToken;
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Не удалось выполнить запрос");
    error.status = response.status;
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    throw error;
  }
  return payload;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value, includeYear = false) {
  if (!value) return "Не указана";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(new Date(`${value}T12:00:00`));
}

function formatToday() {
  const value = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function visitorName(visitor = state.draft.visitors[0]) {
  return [visitor?.lastName, visitor?.firstName, visitor?.middleName].filter(Boolean).join(" ");
}

function guestCountLabel(count) {
  if (count === 1) return "1 гость";
  if (count > 1 && count < 5) return `${count} гостя`;
  return `${count} гостей`;
}

function requestCountLabel(count) {
  const tail = count % 100;
  const last = count % 10;
  if (tail > 10 && tail < 20) return `${count} заявок`;
  if (last === 1) return `${count} заявка`;
  if (last > 1 && last < 5) return `${count} заявки`;
  return `${count} заявок`;
}

function isoDateWithOffset(offset = 0) {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

function shortDate(value) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
    .format(new Date(`${value}T12:00:00`))
    .replace(".", "");
}

function dashboardRequests() {
  const requests = state.requests.map((request) => ({
    id: request.id,
    date: request.visitDate || request.createdAt?.slice(0, 10) || isoDateWithOffset(0),
    name: request.primaryVisitor || "Посетитель",
    place: request.room || "Место не указано",
    type: guestCountLabel(request.visitorCount || 1),
    ...requestPresentation(request),
  }));
  if (hasDraftData()) {
    requests.unshift({
      id: "draft",
      date: state.draft.date,
      name: visitorName() || "Новый посетитель",
      place: state.draft.room || "Место не указано",
      type: guestCountLabel(state.draft.visitors.length),
      status: "Черновик",
      statusKey: "draft",
      resumable: true,
    });
  }
  return requests;
}

function requestPresentation(request) {
  if (request.status === "VERIFIED") return { status: request.externalStatus === "DEMO_VERIFIED" ? "Демо" : "Согласовано", statusKey: "agreed" };
  if (request.status === "REJECTED") return { status: "Отклонено", statusKey: "rejected" };
  if (request.status === "UNKNOWN") return { status: "Нужна проверка", statusKey: "unknown" };
  return { status: "Отправляется", statusKey: "processed" };
}

function filterChip(label, value, current, kind) {
  const active = value === current;
  return `<button class="filter-chip${active ? " active" : ""}" type="button" data-filter-${kind}="${value}" aria-pressed="${active}">${label}</button>`;
}

function requestRow(request) {
  const tag = request.resumable ? "button" : "article";
  const action = request.resumable ? ' type="button" data-action="resume"' : "";
  const statusClass = request.statusKey === "agreed" ? "status-ok" : request.statusKey === "processed" ? "status-processed" : "status-draft";
  return `<${tag} class="request-row${request.resumable ? " request-row-draft" : ""}"${action}>
    <span class="request-date">${escapeHtml(shortDate(request.date))}</span>
    <span class="request-person"><b>${escapeHtml(request.name)}</b><small>${escapeHtml(request.place)} · ${escapeHtml(request.type)}</small></span>
    <i class="status-pill ${statusClass}">${escapeHtml(request.status)}</i>
  </${tag}>`;
}

function hasDraftData() {
  return Boolean(
    state.draft.room
    || state.draft.organization
    || state.draft.visitors.some((visitor) => visitorName(visitor) || visitor.birthDate || visitor.foreignCitizen),
  );
}

function renderHome() {
  const requests = dashboardRequests();
  const filtered = requests.filter((request) => {
    const statusMatches = state.requestStatus === "all" || request.statusKey === state.requestStatus;
    const dateMatches = state.requestDate === "all" || request.date === isoDateWithOffset(state.requestDate === "today" ? 0 : 1);
    return statusMatches && dateMatches;
  });
  const agreed = requests.filter((request) => request.statusKey === "agreed").length;
  const drafts = requests.filter((request) => request.statusKey === "draft").length;
  const requestRows = filtered.length
    ? filtered.map(requestRow).join("")
    : `<div class="request-empty"><b>Заявок не найдено</b><span>Попробуйте изменить статус или дату.</span></div>`;

  app.innerHTML = `
    <section class="dashboard">
      <header class="dashboard-head">
        <div><h1>Заявки</h1><span>${escapeHtml(formatToday())}</span></div>
      </header>
      <div class="dashboard-stats" aria-label="Сводка по заявкам">
        <article><span>Всего заявок</span><b>${requests.length}</b></article>
        <article><span>Согласовано</span><b>${agreed}</b></article>
        <article><span>Черновики</span><b>${drafts}</b></article>
      </div>
      <section class="requests-section">
        <div class="section-title"><h2>Заявки</h2><span>${requestCountLabel(filtered.length)}</span></div>
        <div class="request-filters">
          <div class="filter-group" role="group" aria-label="Статус заявки">
            ${filterChip("Все", "all", state.requestStatus, "status")}
            ${filterChip("Черновик", "draft", state.requestStatus, "status")}
            ${filterChip("Согласовано", "agreed", state.requestStatus, "status")}
            ${filterChip("Обработано", "processed", state.requestStatus, "status")}
          </div>
          <div class="filter-group" role="group" aria-label="Дата посещения">
            ${filterChip("Все даты", "all", state.requestDate, "date")}
            ${filterChip("Сегодня", "today", state.requestDate, "date")}
            ${filterChip("Завтра", "tomorrow", state.requestDate, "date")}
          </div>
        </div>
        <div class="request-list">
          ${requestRows}
        </div>
      </section>
    </section>`;
}

function renderLoading() {
  app.innerHTML = `<section class="login-screen"><div class="login-card"><p class="overline">CHESNIKOVA PASS</p><h1>Подключаемся</h1><p>Проверяем защищённую сессию PassOffice…</p></div></section>`;
}

function renderLogin() {
  app.innerHTML = `<section class="login-screen">
    <form class="login-card" data-login-form>
      <p class="overline">CHESNIKOVA PASS</p>
      <h1>Вход в бюро пропусков</h1>
      <p>Используйте свой логин и пароль от PassOffice. Пароль проверяется на сервере портала и не сохраняется.</p>
      <div class="fields login-fields">
        <div class="field"><label for="portal-login">Логин</label><input id="portal-login" name="login" autocomplete="username" required maxlength="256" /></div>
        <div class="field"><label for="portal-password">Пароль</label><input id="portal-password" name="password" type="password" autocomplete="current-password" required maxlength="1024" /></div>
      </div>
      ${state.loginError ? `<p class="login-error" role="alert">${escapeHtml(state.loginError)}</p>` : ""}
      <button class="button button-primary" type="submit">Войти</button>
      <small class="login-note">Авторизация Active Directory · защищённое соединение</small>
    </form>
  </section>`;
}

function renderNewRequest() {
  const draftOption = hasDraftData() ? `
    <button class="type-card type-card-draft" type="button" data-action="resume">
      <span class="type-icon" aria-hidden="true">↗</span>
      <span><small>Есть черновик</small><b>Продолжить заполнение</b><em>${escapeHtml(state.draft.room || "Место ещё не указано")} · ${guestCountLabel(state.draft.visitors.length)}</em></span>
      <span class="row-arrow" aria-hidden="true">→</span>
    </button>` : "";
  app.innerHTML = `
    <section class="new-request-screen">
      <p class="overline">Новая заявка</p><h1>Как удобнее начать?</h1>
      <p class="screen-lead">Оба способа создают один и тот же редактируемый черновик разового пропуска.</p>
      <div class="type-list">
        ${draftOption}
        <button class="type-card type-card-accent" type="button" data-action="free-text"><span class="type-icon" aria-hidden="true">✦</span><span><small>Быстрый ввод</small><b>Описать своими словами</b><em>Дата, место и гости — одним текстом</em></span><span class="row-arrow" aria-hidden="true">→</span></button>
        <button class="type-card" type="button" data-action="start-fresh"><span class="type-icon" aria-hidden="true">01</span><span><small>По шагам</small><b>Заполнить вручную</b><em>Визит, посетители и проверка</em></span><span class="row-arrow" aria-hidden="true">→</span></button>
        <div class="type-card type-card-disabled" aria-disabled="true"><span class="type-icon" aria-hidden="true">02</span><span><small>Позже</small><b>Импорт списка</b><em>Загрузка файла с посетителями</em></span><span class="lock" aria-hidden="true">—</span></div>
      </div>
      <details class="request-guide">
        <summary>Как проходит оформление <span aria-hidden="true">＋</span></summary>
        <ol class="help-list"><li><div><b>Выберите способ</b><span>Опишите визит своими словами или заполните форму</span></div></li><li><div><b>Проверьте данные</b><span>Сверьте дату, место и посетителей</span></div></li><li><div><b>Дождитесь статуса</b><span>Заявка готова только после подтверждения PassOffice</span></div></li></ol>
      </details>
      <button class="text-button" type="button" data-action="home">Вернуться к заявкам</button>
    </section>`;
}

function renderFreeText() {
  app.innerHTML = `
    <section class="free-text-screen">
      <p class="overline">Новая заявка · быстрый ввод</p>
      <h1>Опишите визит</h1>
      <p class="screen-lead">Напишите дату, место и гостей в свободной форме. ФИО лучше указывать в порядке: фамилия, имя, отчество.</p>
      <div class="free-text-card">
        <label for="freeText">Текст заявки</label>
        <textarea id="freeText" data-free-text placeholder="Например: 27 августа, БП — 10. Гости: Иванов Иван Иванович, Петрова Анна Сергеевна. Организация: Киносервис.">${escapeHtml(state.freeText)}</textarea>
        <span class="field-error" data-error-for="freeText" role="alert" hidden></span>
        <div class="example-copy"><b>Можно короче</b><span>«Завтра, павильон 4. Гости: Воронова Елена Сергеевна»</span></div>
      </div>
      <div class="notice"><i></i><p><b>Сначала только черновик</b><br />Текст разбирается на этом устройстве и ничего не отправляет в PassOffice.</p></div>
      <div class="actions"><button class="button button-primary" type="button" data-action="parse-text">Разобрать текст</button><button class="button button-secondary" type="button" data-action="start-fresh">Заполнить вручную</button></div>
    </section>`;
}

function renderTextPreview() {
  const result = state.parseResult;
  if (!result) { state.screen = "free-text"; return renderFreeText(); }
  const draft = result.draft;
  const missing = result.missing.length
    ? `<div class="parse-missing"><b>Нужно уточнить</b><span>${result.missing.map((item) => escapeHtml(item.label)).join(", ")}</span></div>`
    : `<div class="parse-ready"><i></i><span>Обязательные поля найдены. Всё равно проверьте их перед отправкой.</span></div>`;
  app.innerHTML = `
    <section class="parse-preview-screen">
      <p class="overline">Черновик распознан</p>
      <h1>Вот что я понял</h1>
      <p class="screen-lead">Это ещё не заявка в PassOffice. Дальше каждое поле можно исправить вручную.</p>
      <section class="parse-card" aria-label="Распознанные данные">
        ${parseRow("Дата", draft.date ? formatDate(draft.date, true) : "Не найдена", Boolean(draft.date))}
        ${parseRow("Куда", draft.room || "Не найдено", Boolean(draft.room))}
        ${parseRow("Организация", draft.organization || "Не указана", true)}
        <div class="parse-row parse-visitors"><span>Гости · ${draft.visitors.some((visitor) => visitorName(visitor)) ? draft.visitors.length : 0}</span><div>${draft.visitors.some((visitor) => visitorName(visitor)) ? draft.visitors.map((visitor, index) => `<b>${index + 1}. ${escapeHtml(visitorName(visitor) || "ФИО не распознано")}</b>`).join("") : "<b class=\"not-found\">Не найдены</b>"}</div></div>
      </section>
      ${missing}
      <div class="actions"><button class="button button-primary" type="button" data-action="accept-text-draft">Проверить и исправить</button><button class="button button-secondary" type="button" data-action="edit-text">Изменить исходный текст</button></div>
    </section>`;
}

function parseRow(label, value, found) {
  return `<div class="parse-row"><span>${label}</span><b class="${found ? "" : "not-found"}">${escapeHtml(value)}</b></div>`;
}

function renderStepOne() {
  app.innerHTML = wizardHeader(1, "Детали визита", "Укажите дату и место, куда нужно оформить пропуск") + `
    <div class="form-section">
      <div class="section-kicker"><span>Разовый пропуск</span><b>Сведения о посещении</b></div>
      <div class="fields">
        <div class="field"><label for="date">Дата посещения <span class="required">*</span></label><input id="date" data-draft-key="date" data-path="date" type="date" value="${escapeHtml(state.draft.date)}" required />${inlineError("date")}</div>
        <div class="field"><label for="room">Комната / павильон <span class="required">*</span></label><textarea id="room" data-draft-key="room" data-path="room" placeholder="Например, БП — 10">${escapeHtml(state.draft.room)}</textarea><span class="hint">Укажите точное название или номер из заявки.</span>${inlineError("room")}</div>
        <div class="field"><label for="organization">Организация</label><input id="organization" data-draft-key="organization" data-path="organization" autocomplete="organization" placeholder="Необязательно" value="${escapeHtml(state.draft.organization)}" /><span class="hint">Необязательное поле PassOffice.</span>${inlineError("organization")}</div>
      </div>
    </div>
    <div class="form-footer"><button class="text-button" type="button" data-action="save-exit">Сохранить черновик и выйти</button><div class="actions actions-split"><button class="button button-secondary" type="button" data-action="back">Назад</button><button class="button button-primary" type="button" data-action="next">К посетителям</button></div></div>`;
}

function renderStepTwo() {
  const visitors = state.draft.visitors.map((visitor, index) => renderVisitor(visitor, index)).join("");
  app.innerHTML = wizardHeader(2, "Посетители", "Добавьте одного или нескольких гостей для этого визита") + `
    <div class="visitor-list">${visitors}</div>
    <button class="add-visitor" type="button" data-action="add-visitor" ${state.draft.visitors.length >= 20 ? "disabled" : ""}><span aria-hidden="true">＋</span> Добавить ещё гостя</button>
    <p class="limit-note">Можно добавить до 20 посетителей в одну заявку.</p>
    <div class="form-footer"><button class="text-button" type="button" data-action="save-exit">Сохранить черновик и выйти</button><div class="actions actions-split"><button class="button button-secondary" type="button" data-action="back">Назад</button><button class="button button-primary" type="button" data-action="review">Проверить заявку</button></div></div>`;
}

function renderVisitor(visitor, index) {
  const number = index + 1;
  return `<section class="visitor-card" aria-labelledby="visitor-title-${index}">
    <header class="visitor-head"><div><span>Посетитель ${String(number).padStart(2, "0")}</span><h2 id="visitor-title-${index}">${escapeHtml(visitorName(visitor) || `Гость ${number}`)}</h2></div>${state.draft.visitors.length > 1 ? `<button class="remove-visitor" type="button" data-action="remove-visitor" data-index="${index}" aria-label="Удалить гостя ${number}">Удалить</button>` : ""}</header>
    <div class="fields">
      ${visitorField("Фамилия", "lastName", visitor.lastName, index, "Иванов", "family-name", true)}
      ${visitorField("Имя", "firstName", visitor.firstName, index, "Иван", "given-name", true)}
      ${visitorField("Отчество", "middleName", visitor.middleName, index, "Иванович", "additional-name", true)}
      ${visitorField("Дата рождения", "birthDate", visitor.birthDate, index, "", "bday", false, "date")}
      <label class="check-field" for="foreignCitizen-${index}"><input id="foreignCitizen-${index}" data-visitor-index="${index}" data-visitor-key="foreignCitizen" type="checkbox" ${visitor.foreignCitizen ? "checked" : ""} /><span><b>Иностранный гражданин</b><small>Отметьте, если применимо</small></span></label>
    </div>
  </section>`;
}

function visitorField(label, key, value, index, placeholder, autocomplete, required, type = "text") {
  const path = `visitors.${index}.${key}`;
  return `<div class="field"><label for="${key}-${index}">${label}${required ? ` <span class="required">*</span>` : ""}</label><input id="${key}-${index}" data-visitor-index="${index}" data-visitor-key="${key}" data-path="${path}" type="${type}" autocomplete="${autocomplete}" placeholder="${placeholder}" value="${escapeHtml(value)}" />${!required ? '<span class="hint">Необязательное поле PassOffice.</span>' : ""}${inlineError(path)}</div>`;
}

function renderReview() {
  const d = state.draft;
  app.innerHTML = wizardHeader(3, "Проверка заявки", "Сверьте данные перед отправкой в PassOffice") + `
    <section class="review-section"><header><div><span>01</span><h2>Детали визита</h2></div><button type="button" data-action="edit-visit" aria-label="Изменить детали визита">Изменить</button></header><div class="summary-body">${summary("Тип", "Разовый пропуск")}${summary("Дата", formatDate(d.date, true))}${summary("Куда", d.room || "Не указано")}${summary("Организация", d.organization || "Не указана")}</div></section>
    <section class="review-section"><header><div><span>02</span><h2>Посетители · ${d.visitors.length}</h2></div><button type="button" data-action="edit-visitors" aria-label="Изменить посетителей">Изменить</button></header><div class="review-visitors">${d.visitors.map((visitor, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div><b>${escapeHtml(visitorName(visitor) || `Гость ${index + 1}`)}</b><small>${visitor.birthDate ? escapeHtml(formatDate(visitor.birthDate, true)) : "Дата рождения не указана"}${visitor.foreignCitizen ? " · иностранный гражданин" : ""}</small></div></article>`).join("")}</div></section>
    <div class="submission-note"><b>Что произойдёт дальше</b><span>Заявка будет отправлена от вашего аккаунта, после чего мы покажем её номер и проверенный статус.</span></div>
    <div class="actions"><button class="button button-primary" type="button" data-action="submit-request" ${state.submitting ? "disabled" : ""}>${state.submitting ? "Отправляем…" : "Создать заявку"}</button><button class="button button-secondary" type="button" data-action="back">Вернуться к посетителям</button></div>`;
}

function renderResult() {
  const result = state.lastResult;
  const submitted = result?.draft || freshDraft();
  const isDemo = result?.externalStatus === "DEMO_VERIFIED";
  app.innerHTML = `<section class="result-screen"><div class="result-mark" aria-hidden="true">✓</div><p class="overline">${isDemo ? "Демо · портал не изменён" : "PassOffice · проверено"}</p><h1>${isDemo ? "Заявка собрана" : "Заявка создана"}</h1><p>${isDemo ? "Сценарий работает в демонстрационном режиме. Реальная запись в PassOffice не создавалась." : `Номер заявки: ${escapeHtml(result?.externalId || "—")}`}</p><article class="result-card"><span>${escapeHtml(formatDate(submitted.date, true))}</span><b>${escapeHtml(visitorName(submitted.visitors?.[0]) || "Новый посетитель")}</b><small>${escapeHtml(submitted.room || "Комната или павильон")} · ${guestCountLabel(submitted.visitors?.length || 1)}</small></article><button class="button button-primary" type="button" data-action="home">Вернуться к заявкам</button></section>`;
}

function renderProfile() {
  const login = state.session?.user?.login || "Пользователь";
  app.innerHTML = `<section class="profile-screen"><p class="overline">Профиль</p><h1>Координатор</h1><div class="profile-card"><span class="profile-avatar">${escapeHtml(login.slice(0, 2).toUpperCase())}</span><div><b>${escapeHtml(login)}</b><small>Аккаунт PassOffice</small></div></div><button class="button button-secondary profile-logout" type="button" data-action="logout">Выйти</button></section>`;
}

function wizardHeader(step, title, subtitle) {
  const steps = ["Визит", "Посетители", "Проверка"];
  return `<section class="wizard-head"><div class="progress" aria-hidden="true"><i style="width:${step * 33.333}%"></i></div><div class="step-meta"><span>Разовый пропуск</span><b>Шаг ${step} из 3</b></div><nav class="workflow-nav" aria-label="Этапы заявки">${steps.map((name, index) => {
    const number = index + 1;
    const status = number < step ? "completed" : number === step ? "current" : "future";
    return `<button class="${status}" type="button" data-action="go-step" data-step="${number}" ${number >= step ? "disabled" : ""} ${number === step ? 'aria-current="step"' : ""}><span>${number < step ? "✓" : number}</span><b>${name}</b></button>`;
  }).join("")}</nav><h1>${title}</h1><p>${subtitle}</p></section>`;
}

function summary(label, value) {
  return `<div class="summary-row"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function inlineError(path) {
  return `<span class="field-error" data-error-for="${path}" role="alert" hidden></span>`;
}

function syncInputs() {
  document.querySelectorAll("[data-draft-key]").forEach((field) => { state.draft[field.dataset.draftKey] = field.value.trim(); });
  document.querySelectorAll("[data-visitor-index][data-visitor-key]").forEach((field) => {
    const visitor = state.draft.visitors[Number(field.dataset.visitorIndex)];
    if (visitor) visitor[field.dataset.visitorKey] = field.type === "checkbox" ? field.checked : field.value.trim();
  });
  saveDraft();
}

function clearErrors() {
  document.querySelectorAll("[aria-invalid='true']").forEach((field) => field.removeAttribute("aria-invalid"));
  document.querySelectorAll("[data-error-for]").forEach((error) => { error.hidden = true; error.textContent = ""; });
}

function showIssues(issues) {
  clearErrors();
  issues.forEach(({ path, message }) => {
    const field = [...document.querySelectorAll("[data-path]")].find((item) => item.dataset.path === path);
    const error = [...document.querySelectorAll("[data-error-for]")].find((item) => item.dataset.errorFor === path);
    field?.setAttribute("aria-invalid", "true");
    if (error) { error.textContent = message; error.hidden = false; }
  });
  const firstField = [...document.querySelectorAll("[data-path]")].find((item) => item.dataset.path === issues[0]?.path);
  firstField?.focus();
  if (issues[0]) showToast(issues[0].message);
  haptic("notification", "error");
}

function validateVisit() {
  syncInputs();
  const issues = [];
  if (!state.draft.date) issues.push({ path: "date", message: "Выберите дату посещения" });
  if (!state.draft.room) issues.push({ path: "room", message: "Укажите комнату или павильон" });
  if (issues.length) { showIssues(issues); return false; }
  return true;
}

function validateVisitors() {
  syncInputs();
  const issues = [];
  state.draft.visitors.forEach((visitor, index) => {
    if (!visitor.lastName) issues.push({ path: `visitors.${index}.lastName`, message: `Укажите фамилию гостя ${index + 1}` });
    if (!visitor.firstName) issues.push({ path: `visitors.${index}.firstName`, message: `Укажите имя гостя ${index + 1}` });
    if (!visitor.middleName) issues.push({ path: `visitors.${index}.middleName`, message: `Укажите отчество гостя ${index + 1}` });
  });
  if (issues.length) { showIssues(issues); return false; }
  return true;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function goHome() { state.screen = "home"; state.step = 1; render(); }
function startWizard(step = 1) { state.screen = "wizard"; state.step = step; render(); }

function resumeDraft() {
  const hasVisit = Boolean(state.draft.date && state.draft.room);
  const hasVisitors = state.draft.visitors.some((visitor) => visitorName(visitor));
  startWizard(hasVisit || hasVisitors ? 2 : 1);
}

function navigateBack() {
  syncInputs();
  if (state.screen === "new") return goHome();
  if (state.screen === "free-text") { state.screen = "new"; return render(); }
  if (state.screen === "text-preview") { state.screen = "free-text"; return render(); }
  if (state.screen === "wizard" && state.step === 2) return startWizard(1);
  if (state.screen === "wizard" && state.step === 1) { state.screen = "new"; return render(); }
  if (state.screen === "review") return startWizard(2);
  return goHome();
}

function render() {
  document.body.dataset.screen = state.screen;
  if (state.booting) {
    tabbar.hidden = true;
    backButton.hidden = true;
    return renderLoading();
  }
  if (!state.session) {
    tabbar.hidden = true;
    backButton.hidden = true;
    return renderLogin();
  }
  avatar.textContent = (state.session.user?.login || "П").slice(0, 2).toUpperCase();
  tabbar.hidden = !["home", "new", "profile"].includes(state.screen);
  backButton.hidden = state.screen === "home";
  if (state.screen === "home") renderHome();
  if (state.screen === "new") renderNewRequest();
  if (state.screen === "free-text") renderFreeText();
  if (state.screen === "text-preview") renderTextPreview();
  if (state.screen === "wizard") state.step === 1 ? renderStepOne() : renderStepTwo();
  if (state.screen === "review") renderReview();
  if (state.screen === "result") renderResult();
  if (state.screen === "profile") renderProfile();
  const activeTab = state.screen === "new" ? "new" : state.screen;
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === activeTab;
    tab.classList.toggle("active", active);
    if (active) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0 });
}

document.addEventListener("click", async (event) => {
  const statusFilter = event.target.closest("[data-filter-status]");
  const dateFilter = event.target.closest("[data-filter-date]");
  if (statusFilter || dateFilter) {
    if (statusFilter) state.requestStatus = statusFilter.dataset.filterStatus;
    if (dateFilter) state.requestDate = dateFilter.dataset.filterDate;
    haptic("selection");
    return renderHome();
  }
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
  if (!action) return;
  if (action === "new") { syncInputs(); state.screen = "new"; return render(); }
  if (action === "resume") return resumeDraft();
  if (action === "free-text") { state.screen = "free-text"; state.parseResult = null; return render(); }
  if (action === "parse-text") {
    state.freeText = document.querySelector("[data-free-text]")?.value.trim() || "";
    const error = document.querySelector('[data-error-for="freeText"]');
    if (!state.freeText) {
      if (error) { error.textContent = "Опишите визит или выберите ручное заполнение"; error.hidden = false; }
      document.querySelector("[data-free-text]")?.focus();
      return;
    }
    state.parseResult = parseFreeTextRequest(state.freeText);
    state.draft = { ...freshDraft(), ...state.parseResult.draft, visitors: state.parseResult.draft.visitors.map(normalizeVisitor) };
    state.parseResult.draft = state.draft;
    saveDraft();
    state.screen = "text-preview";
    haptic("selection");
    return render();
  }
  if (action === "edit-text") { state.screen = "free-text"; return render(); }
  if (action === "accept-text-draft") { state.parseResult = null; return startWizard(1); }
  if (action === "start-fresh") {
    if (hasDraftData() && !window.confirm("Начать новую заявку? Текущий черновик будет заменён.")) return;
    state.draft = freshDraft(); saveDraft(); return startWizard(1);
  }
  if (action === "home") { syncInputs(); return goHome(); }
  if (action === "save-exit") { syncInputs(); showToast("Черновик сохранён"); return goHome(); }
  if (action === "next") { if (validateVisit()) return startWizard(2); return; }
  if (action === "back") return navigateBack();
  if (action === "review") { if (validateVisitors()) { state.screen = "review"; state.step = 3; render(); } return; }
  if (action === "edit-visit") return startWizard(1);
  if (action === "edit-visitors") return startWizard(2);
  if (action === "go-step") {
    const step = Number(target.dataset.step);
    if (step === 1) return startWizard(1);
    if (step === 2 && (state.step >= 2 || state.screen === "review")) return startWizard(2);
    return;
  }
  if (action === "add-visitor") {
    syncInputs(); if (state.draft.visitors.length < 20) state.draft.visitors.push(freshVisitor());
    saveDraft(); render(); haptic("selection"); return;
  }
  if (action === "remove-visitor") {
    syncInputs();
    const index = Number(target.dataset.index);
    const visitor = state.draft.visitors[index];
    if (visitorName(visitor) && !window.confirm(`Удалить гостя «${visitorName(visitor)}»?`)) return;
    state.draft.visitors.splice(index, 1); saveDraft(); render(); showToast("Гость удалён"); return;
  }
  if (action === "submit-request") {
    if (state.submitting) return;
    state.submitting = true;
    render();
    try {
      const payload = {
        visitDate: state.draft.date,
        room: state.draft.room,
        organization: state.draft.organization || null,
        visitors: state.draft.visitors.map((visitor) => ({
          lastName: visitor.lastName,
          firstName: visitor.firstName,
          middleName: visitor.middleName,
          birthDate: visitor.birthDate || null,
          isForeignCitizen: visitor.foreignCitizen === true,
        })),
      };
      const response = await apiRequest("/api/requests", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: payload });
      state.lastResult = { ...response.data, draft: structuredClone(state.draft) };
      state.draft = freshDraft();
      await loadRequests();
      state.screen = "result";
      haptic("notification", "success");
    } catch (error) {
      showToast(error.message);
    } finally {
      state.submitting = false;
      render();
    }
    return;
  }
  if (action === "logout") {
    try { await apiRequest("/api/auth/logout", { method: "POST" }); } catch {}
    state.session = null;
    state.requests = [];
    state.draft = freshDraft();
    state.screen = "login";
    return render();
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-login-form]");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector("button[type='submit']");
  const data = new FormData(form);
  state.loginError = "";
  button.disabled = true;
  button.textContent = "Входим…";
  try {
    const response = await apiRequest("/api/auth/login", { method: "POST", body: { login: data.get("login"), password: data.get("password") } });
    state.session = response.data;
    state.screen = previewView === "wizard" ? "wizard" : previewView === "new" ? "new" : previewView === "text" ? "free-text" : previewView === "profile" ? "profile" : "home";
    await loadRequests();
    render();
  } catch (error) {
    state.loginError = error.message;
    render();
    document.querySelector("#portal-login")?.focus();
  } finally {
    data.set("password", "");
  }
});

document.addEventListener("input", (event) => {
  if (!event.target.matches("input, textarea, select")) return;
  if (event.target.matches("[data-free-text]")) {
    state.freeText = event.target.value;
    const freeTextError = document.querySelector('[data-error-for="freeText"]');
    if (freeTextError) freeTextError.hidden = true;
    return;
  }
  syncInputs();
  const error = [...document.querySelectorAll("[data-error-for]")].find((item) => item.dataset.errorFor === event.target.dataset.path);
  event.target.removeAttribute("aria-invalid");
  if (error) error.hidden = true;
});

tabbar.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]")?.dataset.tab;
  if (!tab) return;
  syncInputs(); state.screen = tab; render();
});
backButton.addEventListener("click", navigateBack);
brandLink.addEventListener("click", (event) => { event.preventDefault(); syncInputs(); goHome(); });
avatar.addEventListener("click", () => { syncInputs(); state.screen = "profile"; render(); });

async function loadRequests() {
  const response = await apiRequest("/api/requests?page=1&pageSize=100");
  state.requests = response.data || [];
}

async function bootstrap() {
  render();
  try {
    const response = await apiRequest("/api/session");
    state.session = response.data;
    await loadRequests();
    state.screen = previewView === "wizard" ? "wizard" : previewView === "new" ? "new" : previewView === "text" ? "free-text" : previewView === "profile" ? "profile" : "home";
  } catch (error) {
    if (error.status !== 401) state.loginError = "Сервис временно недоступен";
    state.session = null;
    state.screen = "login";
  } finally {
    state.booting = false;
    render();
  }
}

bootstrap();
