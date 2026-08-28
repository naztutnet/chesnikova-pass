import { ApiError } from "../errors.js";

const REQUEST_STATES = Object.freeze({
  2: "ON_CONFIRMATION",
  3: "CONFIRMED",
  5: "HANDLED",
});

export class PassOfficeWebProvider {
  name = "passoffice-web";

  constructor({ client, siteId, accessGroupId, guestCategoryId }) {
    this.client = client;
    this.siteId = requiredId(siteId, "PASSOFFICE_SITE_ID");
    this.accessGroupId = requiredId(accessGroupId, "PASSOFFICE_ACCESS_GROUP_ID");
    this.guestCategoryId = requiredId(guestCategoryId, "PASSOFFICE_GUEST_CATEGORY_ID");
  }

  async submit(input, { portalSession }) {
    if (!portalSession?.accessToken || !portalSession?.refreshToken) {
      throw new ApiError(401, "PASSOFFICE_SESSION_REQUIRED", "Войдите с логином и паролем от PassOffice");
    }

    const profile = await this.client.getMe(portalSession);
    const personalId = refId(profile?.me?.personal);
    if (!personalId) {
      throw new ApiError(502, "PASSOFFICE_PROFILE_INVALID", "PassOffice не вернул профиль сотрудника");
    }

    const [meetingPerson, site, accessGroup, guestCategory] = await Promise.all([
      this.client.getObject(portalSession, "Person", personalId),
      this.client.getObject(portalSession, "Site", this.siteId),
      this.client.getObject(portalSession, "AccessGroup", this.accessGroupId),
      this.client.getObject(portalSession, "PersonCategory", this.guestCategoryId),
    ]);
    const organization = profile?.me?.organization || meetingPerson?.organization || null;
    const visitors = [];
    for (const visitor of input.visitors) {
      const created = await this.client.addObject(portalSession, "Person", personPayload(visitor, { guestCategory, organization }));
      if (!refId(created)) {
        throw new ApiError(502, "PASSOFFICE_INVALID_PERSON_RESPONSE", "PassOffice не подтвердил создание посетителя");
      }
      visitors.push(created);
    }

    const draftPayload = requestPayload(input, { visitors, meetingPerson, site, accessGroup, organization });
    let draft;
    try {
      draft = await this.client.addObject(portalSession, "Request", draftPayload);
    } catch (error) {
      if (["PASSOFFICE_TIMEOUT", "PASSOFFICE_UNAVAILABLE"].includes(error?.code)) error.outcomeUnknown = true;
      throw error;
    }
    if (!refId(draft)) {
      const error = new ApiError(502, "PASSOFFICE_INVALID_DRAFT_RESPONSE", "PassOffice не подтвердил создание черновика заявки");
      error.outcomeUnknown = true;
      throw error;
    }

    const validation = await this.client.validateDraft(portalSession, draft);
    assertValidationAccepted(validation);

    let confirmed;
    try {
      confirmed = await this.client.confirmDraft(portalSession, draft);
    } catch (error) {
      if (["PASSOFFICE_TIMEOUT", "PASSOFFICE_UNAVAILABLE"].includes(error?.code)) error.outcomeUnknown = true;
      throw error;
    }

    const externalId = refId(confirmed);
    const externalStatus = REQUEST_STATES[confirmed?.state];
    if (!externalId || !externalStatus) {
      const error = new ApiError(502, "PASSOFFICE_RESULT_UNKNOWN", "PassOffice принял данные, но не вернул итоговый номер и статус");
      error.outcomeUnknown = true;
      throw error;
    }
    return { externalId: String(externalId), externalStatus };
  }
}

function personPayload(visitor, { guestCategory, organization }) {
  return {
    id: 0,
    parentId: 0,
    type: "Person",
    active: true,
    surname: visitor.lastName,
    name: visitor.firstName,
    middlename: visitor.middleName,
    phone: "",
    workPhone: "",
    email: "",
    gender: 2,
    room: "",
    passes: [],
    documents: [],
    birthday: visitor.birthDate ? moscowDateTime(visitor.birthDate, "00:00:00") : "",
    addField1: "",
    addField2: "",
    addField3: "",
    addField4: "",
    addField5: "",
    addField6: "",
    addField7: "",
    addField8: "",
    addField9: "",
    addField10: "",
    isForeignCitizen: visitor.isForeignCitizen,
    photoId: null,
    category: guestCategory,
    ...(organization ? { organization } : {}),
  };
}

function requestPayload(input, { visitors, meetingPerson, site, accessGroup, organization }) {
  return {
    id: 0,
    parentId: 0,
    type: "Request",
    active: true,
    state: 1,
    passType: 0,
    activateDateTime: moscowDateTime(input.visitDate, "00:00:00"),
    deactivateDateTime: moscowDateTime(input.visitDate, "23:59:00"),
    visitors,
    purposeOfVisit: "",
    addInfo: "",
    accessGroups: [accessGroup],
    orderedAccessGroups: [accessGroup],
    confirmChain: [],
    sites: [site],
    meetingPerson,
    inviter: meetingPerson,
    inviterId: meetingPerson.id,
    organization,
    parkingSpaces: [],
    cars: [],
    needParkingPlace: false,
    isMaterialValuesIngoing: false,
    isMaterialValuesOutgoing: false,
    customRequestType: null,
    replacementPass: [],
    passStatusId: null,
    inviteId: null,
    copyOf: null,
    need2Confirm: false,
    activityPeriod: 0,
    addField1: input.room,
    addField2: "",
    addField3: "",
    addField4: "",
    addField5: "",
    addField6: "",
    addField7: "",
    addField8: "",
    addField9: "",
    addField10: "",
    dictAddField1: null,
    dictAddField2: null,
    boolAddField1: false,
    boolAddField2: false,
  };
}

function assertValidationAccepted(value) {
  if (!Array.isArray(value)) {
    throw new ApiError(502, "PASSOFFICE_INVALID_VALIDATION_RESPONSE", "PassOffice вернул неожиданный результат проверки заявки");
  }
  const rejected = value.find((item) => item?.ok !== true);
  if (rejected) {
    const message = typeof rejected.message === "string" && rejected.message.trim()
      ? rejected.message.trim()
      : "PassOffice не разрешил создать заявку";
    throw new ApiError(422, "PASSOFFICE_VALIDATION_FAILED", message);
  }
}

function refId(value) {
  const id = Number(typeof value === "object" && value !== null ? value.id : value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requiredId(value, name) {
  const id = refId(value);
  if (!id) throw new Error(`${name} must be a positive integer`);
  return id;
}

function moscowDateTime(date, time) {
  return new Date(`${date}T${time}+03:00`).toISOString();
}
