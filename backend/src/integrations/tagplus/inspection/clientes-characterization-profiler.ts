import {
  ARRAY_ELEMENT_PATHS,
  SCALAR_VALUE_PATHS,
  type ArrayElementPath,
  type ScalarValuePath,
} from "./clientes-characterization-scope.js";
import {
  classifyCnpj,
  classifyCpf,
  classifyDate,
  classifyEmail,
  classifyPhone,
  type DateFormatClass,
  type DocumentFormatClass,
  type EmailFormatClass,
  type PhoneFormatClass,
} from "./clientes-format-classifiers.js";

export type ObservedJsonType =
  "array" | "boolean" | "null" | "number" | "object" | "string";

export interface ValueStatistics {
  path: ScalarValuePath;
  presentCount: number;
  missingCount: number;
  nullCount: number;
  emptyStringCount: number;
  whitespaceOnlyCount: number;
  nonEmptyCount: number;
  observedTypes: ObservedJsonType[];
  rawLengthMin: number | null;
  rawLengthMax: number | null;
  trimmedLengthMin: number | null;
  trimmedLengthMax: number | null;
  distinctCount?: number;
}

export interface BooleanStatistics {
  path: "$.ativo" | "$.exterior" | "$.indicador_ie" | "$.recebe_email";
  trueCount: number;
  falseCount: number;
  nullCount: number;
  missingCount: number;
  otherTypeCount: number;
}

export interface ArrayStatistics {
  path: "$.contatos" | "$.enderecos";
  customersWithArray: number;
  customersWithoutArray: number;
  nullArrayCount: number;
  otherTypeCount: number;
  emptyArrayCount: number;
  nonEmptyArrayCount: number;
  minItems: number | null;
  maxItems: number | null;
  customersWith0Items: number;
  customersWith1Item: number;
  customersWith2Items: number;
  customersWith3OrMoreItems: number;
  customersWithMultipleItems: number;
  totalElementsObserved: number;
}

export interface ArrayElementStatistics {
  path: ArrayElementPath;
  customersContainingPath: number;
  customersMissingPath: number;
  elementsContainingPath: number;
  elementsMissingPath: number;
  elementsNull: number;
  elementsNonNull: number;
  observedTypes: ObservedJsonType[];
  emptyStringCount: number;
  whitespaceOnlyCount: number;
  nonEmptyStringCount: number;
  rawLengthMin: number | null;
  rawLengthMax: number | null;
  trimmedLengthMin: number | null;
  trimmedLengthMax: number | null;
}

export interface OptionalObjectStatistics {
  path: string;
  objectPresentCount: number;
  objectNullCount: number;
  missingCount: number;
  otherTypeCount: number;
  distinctIdCount: number;
  distinctDescriptionCount: number;
  distinctParentIdCount?: number;
}

export interface BinaryAggregate {
  leftTrueRightTrue: number;
  leftTrueRightFalse: number;
  leftFalseRightTrue: number;
  leftFalseRightFalse: number;
}

export interface ClientesCharacterizationProfile {
  recordsObserved: number;
  scalarFields: ValueStatistics[];
  documentFormats: {
    cpf: Record<DocumentFormatClass, number>;
    cnpj: Record<DocumentFormatClass, number>;
  };
  emailFormats: Record<EmailFormatClass, number>;
  phoneFormats: Record<PhoneFormatClass, number>;
  dateFormats: Array<{
    path: "$.data_alteracao" | "$.data_cadastro" | "$.data_nascimento";
    counts: Record<DateFormatClass, number>;
    timezonePresentCount: number;
    timezoneAbsentCount: number;
  }>;
  booleans: BooleanStatistics[];
  identity: {
    id: DistinctStatistics;
    idEntidade: DistinctStatistics;
    pairedRecords: number;
    distinctPairCount: number;
    idsWithMultipleEntityIds: number;
    entityIdsWithMultipleIds: number;
  };
  arrays: ArrayStatistics[];
  arrayElements: ArrayElementStatistics[];
  contacts: {
    customersWithContacts: number;
    customersWithMultipleContacts: number;
    customersWithPrincipalContact: number;
    customersWithMultiplePrincipalContacts: number;
    customersWithNoPrincipalContactAmongNonEmpty: number;
    principal: ElementBooleanStatistics;
    estrangeiro: ElementBooleanStatistics;
    tipoCadastro: OptionalObjectStatistics;
    tipoContato: OptionalObjectStatistics;
  };
  addresses: {
    customersWithAddresses: number;
    customersWithoutAddresses: number;
    customersWithMultipleAddresses: number;
    customersWithPrincipalAddress: number;
    customersWithMultiplePrincipalAddresses: number;
    customersWithNoPrincipalAddressAmongNonEmpty: number;
    addressesWithCompleteCityObject: number;
    addressesWithCompleteStateObject: number;
    addressesWithCompleteCountryObject: number;
    addressesWithTagPulseCoreLocation: number;
    coreLocationDefinition: "TAGPULSE_INSPECTION_CONVENTION";
    principal: ElementBooleanStatistics;
    exterior: ElementBooleanStatistics;
    tipoCadastro: OptionalObjectStatistics;
  };
  category: OptionalObjectStatistics;
  crossField: {
    documents: {
      CPF_ONLY: number;
      CNPJ_ONLY: number;
      BOTH: number;
      NEITHER: number;
    };
    codes: BinaryAggregate;
    emailUsableByContactsNonEmpty: BinaryAggregate;
    phoneUsableByContactsNonEmpty: BinaryAggregate;
    emailOrPhoneUsableByContactsNonEmpty: BinaryAggregate;
    contactsNonEmptyByPrincipalExists: BinaryAggregate;
    contactsMultipleByPrincipalExists: BinaryAggregate;
    addressesNonEmptyByPrincipalExists: BinaryAggregate;
    addressesMultipleByPrincipalExists: BinaryAggregate;
    customerExteriorByExteriorAddressExists: BinaryAggregate;
    ativoByRecebeEmail: BinaryAggregate;
    cnpjUsableByIeUsable: BinaryAggregate;
    cnpjUsableByCnaeUsable: BinaryAggregate;
  };
}

interface DistinctStatistics {
  nonNullCount: number;
  distinctCount: number;
  duplicateOccurrences: number;
  duplicateGroups: number;
}

interface ElementBooleanStatistics {
  trueCount: number;
  falseCount: number;
  nullCount: number;
  missingCount: number;
  otherTypeCount: number;
}

interface MutableValue extends Omit<ValueStatistics, "observedTypes"> {
  types: Set<ObservedJsonType>;
  distinct?: Set<unknown>;
}

interface MutableElement extends Omit<ArrayElementStatistics, "observedTypes"> {
  types: Set<ObservedJsonType>;
}

interface MutableObject extends OptionalObjectStatistics {
  ids: Set<unknown>;
  descriptions: Set<unknown>;
  parentIds?: Set<unknown>;
}

export interface ClientesCharacterizationProfiler {
  inspectRecord(value: unknown): void;
  finalize(): ClientesCharacterizationProfile;
}

const DISTINCT_SCALARS = new Set<ScalarValuePath>([
  "$.codigo",
  "$.codigo_externo",
  "$.tipo",
]);
const BOOLEAN_PATHS = [
  "$.ativo",
  "$.exterior",
  "$.indicador_ie",
  "$.recebe_email",
] as const;
const DATE_PATHS = [
  "$.data_alteracao",
  "$.data_cadastro",
  "$.data_nascimento",
] as const;

export function createClientesCharacterizationProfiler(): ClientesCharacterizationProfiler {
  let recordsObserved = 0;
  let finalized = false;
  const scalar = new Map(
    SCALAR_VALUE_PATHS.map((path) => [path, emptyValue(path)]),
  );
  const booleans = new Map(BOOLEAN_PATHS.map((path) => [path, emptyBoolean()]));
  const documents = {
    cpf: emptyCounts<DocumentFormatClass>([
      "CPF_STANDARD_PUNCTUATED",
      "CPF_DIGITS_ONLY",
      "CNPJ_STANDARD_PUNCTUATED",
      "CNPJ_DIGITS_ONLY",
      "EMPTY",
      "OTHER",
      "OTHER_TYPE",
    ]),
    cnpj: emptyCounts<DocumentFormatClass>([
      "CPF_STANDARD_PUNCTUATED",
      "CPF_DIGITS_ONLY",
      "CNPJ_STANDARD_PUNCTUATED",
      "CNPJ_DIGITS_ONLY",
      "EMPTY",
      "OTHER",
      "OTHER_TYPE",
    ]),
  };
  const emailFormats = emptyCounts<EmailFormatClass>([
    "EMPTY",
    "EMAIL_LIKE",
    "NON_EMAIL_STRING",
    "OTHER_TYPE",
  ]);
  const phoneFormats = emptyCounts<PhoneFormatClass>([
    "EMPTY",
    "PHONE_DIGITS_ONLY",
    "PHONE_FORMATTED",
    "PHONE_OTHER",
    "OTHER_TYPE",
  ]);
  const dates = new Map(
    DATE_PATHS.map((path) => [
      path,
      {
        counts: emptyCounts<DateFormatClass>([
          "DATE_ONLY",
          "DATETIME_WITH_TIMEZONE",
          "DATETIME_WITHOUT_TIMEZONE",
          "EMPTY",
          "INVALID_OR_UNCLASSIFIED",
          "OTHER_TYPE",
        ]),
        timezonePresentCount: 0,
        timezoneAbsentCount: 0,
      },
    ]),
  );
  const identityCounts = {
    id: new Map<unknown, number>(),
    idEntidade: new Map<unknown, number>(),
  };
  const entitiesById = new Map<unknown, Set<unknown>>();
  const idsByEntity = new Map<unknown, Set<unknown>>();
  let pairedRecords = 0;
  const arrays = {
    contatos: emptyArray("$.contatos"),
    enderecos: emptyArray("$.enderecos"),
  };
  const elementProfiles = new Map(
    ARRAY_ELEMENT_PATHS.map((path) => [path, emptyElement(path)]),
  );
  const contactSummary = emptyContactSummary();
  const addressSummary = emptyAddressSummary();
  const category = emptyObject("$.categoria", true);
  const cross = createCrossFields();

  function inspectRecord(value: unknown): void {
    if (finalized)
      throw new Error("Characterization profiler already finalized");
    recordsObserved += 1;
    const record = isObject(value) ? value : {};
    for (const path of SCALAR_VALUE_PATHS) {
      const key = path.slice(2);
      inspectRootValue(scalar.get(path)!, record, key);
    }
    inspectFormats(record);
    for (const path of BOOLEAN_PATHS)
      inspectRootBoolean(booleans.get(path)!, record, path.slice(2));
    inspectIdentity(record);
    const contacts = inspectArray(record, "contatos", arrays.contatos);
    const addresses = inspectArray(record, "enderecos", arrays.enderecos);
    inspectContacts(contacts);
    inspectAddresses(addresses);
    inspectCategory(record);
    inspectCrossFields(record, contacts, addresses);
  }

  function inspectFormats(record: Record<string, unknown>): void {
    if (has(record, "cpf")) documents.cpf[classifyCpf(record.cpf)] += 1;
    if (has(record, "cnpj")) documents.cnpj[classifyCnpj(record.cnpj)] += 1;
    if (has(record, "email")) emailFormats[classifyEmail(record.email)] += 1;
    if (has(record, "telefone"))
      phoneFormats[classifyPhone(record.telefone)] += 1;
    for (const path of DATE_PATHS) {
      const key = path.slice(2);
      if (!has(record, key)) continue;
      const value = record[key];
      const result = dates.get(path)!;
      const format = classifyDate(value);
      result.counts[format] += 1;
      if (format === "DATETIME_WITH_TIMEZONE") result.timezonePresentCount += 1;
      if (format === "DATE_ONLY" || format === "DATETIME_WITHOUT_TIMEZONE")
        result.timezoneAbsentCount += 1;
    }
  }

  function inspectIdentity(record: Record<string, unknown>): void {
    if (has(record, "id") && record.id !== null)
      increment(identityCounts.id, record.id);
    if (has(record, "id_entidade") && record.id_entidade !== null)
      increment(identityCounts.idEntidade, record.id_entidade);
    if (
      has(record, "id") &&
      record.id !== null &&
      has(record, "id_entidade") &&
      record.id_entidade !== null
    ) {
      pairedRecords += 1;
      relate(entitiesById, record.id, record.id_entidade);
      relate(idsByEntity, record.id_entidade, record.id);
    }
  }

  function inspectContacts(contacts: unknown[] | null): void {
    inspectElementGroup("contatos", contacts);
    if (!contacts || contacts.length === 0) return;
    contactSummary.customersWithContacts += 1;
    if (contacts.length > 1) contactSummary.customersWithMultipleContacts += 1;
    let principals = 0;
    for (const item of contacts) {
      const object = isObject(item) ? item : {};
      inspectElementBoolean(contactSummary.principal, object, "principal");
      inspectElementBoolean(contactSummary.estrangeiro, object, "estrangeiro");
      inspectOptionalObject(
        contactSummary.tipoCadastro,
        object,
        "tipo_cadastro",
      );
      inspectOptionalObject(contactSummary.tipoContato, object, "tipo_contato");
      if (object.principal === true) principals += 1;
    }
    if (principals > 0) contactSummary.customersWithPrincipalContact += 1;
    else contactSummary.customersWithNoPrincipalContactAmongNonEmpty += 1;
    if (principals > 1)
      contactSummary.customersWithMultiplePrincipalContacts += 1;
  }

  function inspectAddresses(addresses: unknown[] | null): void {
    inspectElementGroup("enderecos", addresses);
    if (!addresses || addresses.length === 0) {
      addressSummary.customersWithoutAddresses += 1;
      return;
    }
    addressSummary.customersWithAddresses += 1;
    if (addresses.length > 1)
      addressSummary.customersWithMultipleAddresses += 1;
    let principals = 0;
    for (const item of addresses) {
      const object = isObject(item) ? item : {};
      inspectElementBoolean(addressSummary.principal, object, "principal");
      inspectElementBoolean(addressSummary.exterior, object, "exterior");
      inspectOptionalObject(
        addressSummary.tipoCadastro,
        object,
        "tipo_cadastro",
      );
      if (object.principal === true) principals += 1;
      const city = isObject(object.cidade) ? object.cidade : null;
      const state = city && isObject(city.estado) ? city.estado : null;
      const country = isObject(object.pais) ? object.pais : null;
      if (city && usable(city.nome))
        addressSummary.addressesWithCompleteCityObject += 1;
      if (state && (usable(state.sigla) || usable(state.nome)))
        addressSummary.addressesWithCompleteStateObject += 1;
      if (country && usable(country.nome))
        addressSummary.addressesWithCompleteCountryObject += 1;
      if (
        usable(object.logradouro) &&
        usable(object.numero) &&
        usable(object.bairro) &&
        usable(object.cep) &&
        city &&
        state &&
        country
      )
        addressSummary.addressesWithTagPulseCoreLocation += 1;
    }
    if (principals > 0) addressSummary.customersWithPrincipalAddress += 1;
    else addressSummary.customersWithNoPrincipalAddressAmongNonEmpty += 1;
    if (principals > 1)
      addressSummary.customersWithMultiplePrincipalAddresses += 1;
  }

  function inspectElementGroup(
    group: "contatos" | "enderecos",
    items: unknown[] | null,
  ): void {
    const relevant = ARRAY_ELEMENT_PATHS.filter((path) =>
      path.startsWith(`$.${group}[]`),
    );
    const containing = new Set<ArrayElementPath>();
    for (const item of items ?? []) {
      const object = isObject(item) ? item : {};
      for (const path of relevant) {
        const segments = elementSegments(path);
        const lookup =
          segments.length === 0
            ? { present: isObject(item), value: item }
            : lookupPath(object, segments);
        const stats = elementProfiles.get(path)!;
        if (!lookup.present) {
          stats.elementsMissingPath += 1;
          continue;
        }
        containing.add(path);
        stats.elementsContainingPath += 1;
        stats.types.add(typeOf(lookup.value));
        if (lookup.value === null) stats.elementsNull += 1;
        else stats.elementsNonNull += 1;
        if (typeof lookup.value === "string")
          inspectElementString(stats, lookup.value);
      }
    }
    for (const path of relevant) {
      const stats = elementProfiles.get(path)!;
      if (containing.has(path)) stats.customersContainingPath += 1;
      else stats.customersMissingPath += 1;
    }
  }

  function inspectCategory(record: Record<string, unknown>): void {
    inspectOptionalObject(category, record, "categoria", true);
  }

  function inspectCrossFields(
    record: Record<string, unknown>,
    contacts: unknown[] | null,
    addresses: unknown[] | null,
  ): void {
    const cpf = usable(record.cpf),
      cnpj = usable(record.cnpj);
    if (cpf && cnpj) cross.documents.BOTH += 1;
    else if (cpf) cross.documents.CPF_ONLY += 1;
    else if (cnpj) cross.documents.CNPJ_ONLY += 1;
    else cross.documents.NEITHER += 1;
    const contactNonEmpty = Boolean(contacts?.length);
    const contactPrincipal = Boolean(
      contacts?.some((item) => isObject(item) && item.principal === true),
    );
    const addressNonEmpty = Boolean(addresses?.length);
    const addressPrincipal = Boolean(
      addresses?.some((item) => isObject(item) && item.principal === true),
    );
    const exteriorAddress = Boolean(
      addresses?.some((item) => isObject(item) && item.exterior === true),
    );
    tally(cross.codes, usable(record.codigo), usable(record.codigo_externo));
    tally(
      cross.emailUsableByContactsNonEmpty,
      usable(record.email),
      contactNonEmpty,
    );
    tally(
      cross.phoneUsableByContactsNonEmpty,
      usable(record.telefone),
      contactNonEmpty,
    );
    tally(
      cross.emailOrPhoneUsableByContactsNonEmpty,
      usable(record.email) || usable(record.telefone),
      contactNonEmpty,
    );
    tally(
      cross.contactsNonEmptyByPrincipalExists,
      contactNonEmpty,
      contactPrincipal,
    );
    tally(
      cross.contactsMultipleByPrincipalExists,
      (contacts?.length ?? 0) > 1,
      contactPrincipal,
    );
    tally(
      cross.addressesNonEmptyByPrincipalExists,
      addressNonEmpty,
      addressPrincipal,
    );
    tally(
      cross.addressesMultipleByPrincipalExists,
      (addresses?.length ?? 0) > 1,
      addressPrincipal,
    );
    tally(
      cross.customerExteriorByExteriorAddressExists,
      record.exterior === true,
      exteriorAddress,
    );
    tally(
      cross.ativoByRecebeEmail,
      record.ativo === true,
      record.recebe_email === true,
    );
    tally(cross.cnpjUsableByIeUsable, cnpj, usable(record.ie));
    tally(cross.cnpjUsableByCnaeUsable, cnpj, usable(record.cnae));
  }

  function finalize(): ClientesCharacterizationProfile {
    if (finalized)
      throw new Error("Characterization profiler already finalized");
    finalized = true;
    const profile: ClientesCharacterizationProfile = {
      recordsObserved,
      scalarFields: SCALAR_VALUE_PATHS.map((path) =>
        finalizeValue(scalar.get(path)!),
      ),
      documentFormats: {
        cpf: { ...documents.cpf },
        cnpj: { ...documents.cnpj },
      },
      emailFormats: { ...emailFormats },
      phoneFormats: { ...phoneFormats },
      dateFormats: DATE_PATHS.map((path) => ({
        path,
        counts: { ...dates.get(path)!.counts },
        timezonePresentCount: dates.get(path)!.timezonePresentCount,
        timezoneAbsentCount: dates.get(path)!.timezoneAbsentCount,
      })),
      booleans: BOOLEAN_PATHS.map((path) => ({ path, ...booleans.get(path)! })),
      identity: {
        id: distinctResult(identityCounts.id),
        idEntidade: distinctResult(identityCounts.idEntidade),
        pairedRecords,
        distinctPairCount: sumRelations(entitiesById),
        idsWithMultipleEntityIds: countMultiple(entitiesById),
        entityIdsWithMultipleIds: countMultiple(idsByEntity),
      },
      arrays: [
        finalizeArray(arrays.contatos, recordsObserved),
        finalizeArray(arrays.enderecos, recordsObserved),
      ],
      arrayElements: ARRAY_ELEMENT_PATHS.map((path) =>
        finalizeElement(elementProfiles.get(path)!),
      ),
      contacts: finalizeContact(contactSummary),
      addresses: finalizeAddress(addressSummary),
      category: finalizeObject(category),
      crossField: cloneCross(cross),
    };
    clearSensitiveSets(
      scalar,
      identityCounts,
      entitiesById,
      idsByEntity,
      contactSummary,
      addressSummary,
      category,
    );
    return profile;
  }

  return { inspectRecord, finalize };
}

function emptyValue(path: ScalarValuePath): MutableValue {
  return {
    path,
    presentCount: 0,
    missingCount: 0,
    nullCount: 0,
    emptyStringCount: 0,
    whitespaceOnlyCount: 0,
    nonEmptyCount: 0,
    types: new Set(),
    rawLengthMin: null,
    rawLengthMax: null,
    trimmedLengthMin: null,
    trimmedLengthMax: null,
    ...(DISTINCT_SCALARS.has(path) ? { distinct: new Set<unknown>() } : {}),
  };
}

function inspectRootValue(
  stats: MutableValue,
  record: Record<string, unknown>,
  key: string,
): void {
  if (!has(record, key)) {
    stats.missingCount += 1;
    return;
  }
  stats.presentCount += 1;
  const value = record[key];
  stats.types.add(typeOf(value));
  if (value === null) stats.nullCount += 1;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (value.length === 0) stats.emptyStringCount += 1;
    else if (trimmed.length === 0) stats.whitespaceOnlyCount += 1;
    else stats.nonEmptyCount += 1;
    stats.rawLengthMin = min(stats.rawLengthMin, value.length);
    stats.rawLengthMax = max(stats.rawLengthMax, value.length);
    stats.trimmedLengthMin = min(stats.trimmedLengthMin, trimmed.length);
    stats.trimmedLengthMax = max(stats.trimmedLengthMax, trimmed.length);
  } else if (value !== null) stats.nonEmptyCount += 1;
  if (value !== null && stats.distinct) stats.distinct.add(value);
}

function finalizeValue(stats: MutableValue): ValueStatistics {
  const { types, distinct, ...base } = stats;
  return {
    ...base,
    observedTypes: [...types].sort(),
    ...(distinct ? { distinctCount: distinct.size } : {}),
  };
}

function emptyBoolean(): Omit<BooleanStatistics, "path"> {
  return {
    trueCount: 0,
    falseCount: 0,
    nullCount: 0,
    missingCount: 0,
    otherTypeCount: 0,
  };
}

function inspectRootBoolean(
  stats: Omit<BooleanStatistics, "path">,
  record: Record<string, unknown>,
  key: string,
): void {
  if (!has(record, key)) stats.missingCount += 1;
  else if (record[key] === true) stats.trueCount += 1;
  else if (record[key] === false) stats.falseCount += 1;
  else if (record[key] === null) stats.nullCount += 1;
  else stats.otherTypeCount += 1;
}

function emptyArray(path: ArrayStatistics["path"]): ArrayStatistics {
  return {
    path,
    customersWithArray: 0,
    customersWithoutArray: 0,
    nullArrayCount: 0,
    otherTypeCount: 0,
    emptyArrayCount: 0,
    nonEmptyArrayCount: 0,
    minItems: null,
    maxItems: null,
    customersWith0Items: 0,
    customersWith1Item: 0,
    customersWith2Items: 0,
    customersWith3OrMoreItems: 0,
    customersWithMultipleItems: 0,
    totalElementsObserved: 0,
  };
}

function inspectArray(
  record: Record<string, unknown>,
  key: string,
  stats: ArrayStatistics,
): unknown[] | null {
  if (!has(record, key)) {
    stats.customersWithoutArray += 1;
    return null;
  }
  const value = record[key];
  if (value === null) {
    stats.customersWithoutArray += 1;
    stats.nullArrayCount += 1;
    return null;
  }
  if (!Array.isArray(value)) {
    stats.customersWithoutArray += 1;
    stats.otherTypeCount += 1;
    return null;
  }
  stats.customersWithArray += 1;
  stats.totalElementsObserved += value.length;
  stats.minItems = min(stats.minItems, value.length);
  stats.maxItems = max(stats.maxItems, value.length);
  if (value.length === 0) {
    stats.emptyArrayCount += 1;
    stats.customersWith0Items += 1;
  } else {
    stats.nonEmptyArrayCount += 1;
    if (value.length === 1) stats.customersWith1Item += 1;
    else if (value.length === 2) stats.customersWith2Items += 1;
    else stats.customersWith3OrMoreItems += 1;
    if (value.length > 1) stats.customersWithMultipleItems += 1;
  }
  return value;
}

function finalizeArray(
  stats: ArrayStatistics,
  records: number,
): ArrayStatistics {
  return {
    ...stats,
    customersWithoutArray: records - stats.customersWithArray,
  };
}

function emptyElement(path: ArrayElementPath): MutableElement {
  return {
    path,
    customersContainingPath: 0,
    customersMissingPath: 0,
    elementsContainingPath: 0,
    elementsMissingPath: 0,
    elementsNull: 0,
    elementsNonNull: 0,
    types: new Set(),
    emptyStringCount: 0,
    whitespaceOnlyCount: 0,
    nonEmptyStringCount: 0,
    rawLengthMin: null,
    rawLengthMax: null,
    trimmedLengthMin: null,
    trimmedLengthMax: null,
  };
}

function inspectElementString(stats: MutableElement, value: string): void {
  const trimmed = value.trim();
  if (value.length === 0) stats.emptyStringCount += 1;
  else if (trimmed.length === 0) stats.whitespaceOnlyCount += 1;
  else stats.nonEmptyStringCount += 1;
  stats.rawLengthMin = min(stats.rawLengthMin, value.length);
  stats.rawLengthMax = max(stats.rawLengthMax, value.length);
  stats.trimmedLengthMin = min(stats.trimmedLengthMin, trimmed.length);
  stats.trimmedLengthMax = max(stats.trimmedLengthMax, trimmed.length);
}

function finalizeElement(stats: MutableElement): ArrayElementStatistics {
  const { types, ...base } = stats;
  return { ...base, observedTypes: [...types].sort() };
}

function emptyObject(path: string, parent = false): MutableObject {
  return {
    path,
    objectPresentCount: 0,
    objectNullCount: 0,
    missingCount: 0,
    otherTypeCount: 0,
    distinctIdCount: 0,
    distinctDescriptionCount: 0,
    ...(parent
      ? { distinctParentIdCount: 0, parentIds: new Set<unknown>() }
      : {}),
    ids: new Set(),
    descriptions: new Set(),
  };
}

function inspectOptionalObject(
  stats: MutableObject,
  holder: Record<string, unknown>,
  key: string,
  parent = false,
): void {
  if (!has(holder, key)) {
    stats.missingCount += 1;
    return;
  }
  const value = holder[key];
  if (value === null) {
    stats.objectNullCount += 1;
    return;
  }
  if (!isObject(value)) {
    stats.otherTypeCount += 1;
    return;
  }
  stats.objectPresentCount += 1;
  if (has(value, "id") && value.id !== null) stats.ids.add(value.id);
  if (has(value, "descricao") && value.descricao !== null)
    stats.descriptions.add(value.descricao);
  if (
    parent &&
    has(value, "id_categoria_mae") &&
    value.id_categoria_mae !== null
  )
    stats.parentIds?.add(value.id_categoria_mae);
}

function finalizeObject(stats: MutableObject): OptionalObjectStatistics {
  return {
    path: stats.path,
    objectPresentCount: stats.objectPresentCount,
    objectNullCount: stats.objectNullCount,
    missingCount: stats.missingCount,
    otherTypeCount: stats.otherTypeCount,
    distinctIdCount: stats.ids.size,
    distinctDescriptionCount: stats.descriptions.size,
    ...(stats.parentIds ? { distinctParentIdCount: stats.parentIds.size } : {}),
  };
}

function emptyContactSummary() {
  return {
    customersWithContacts: 0,
    customersWithMultipleContacts: 0,
    customersWithPrincipalContact: 0,
    customersWithMultiplePrincipalContacts: 0,
    customersWithNoPrincipalContactAmongNonEmpty: 0,
    principal: emptyElementBoolean(),
    estrangeiro: emptyElementBoolean(),
    tipoCadastro: emptyObject("$.contatos[].tipo_cadastro"),
    tipoContato: emptyObject("$.contatos[].tipo_contato"),
  };
}

function emptyAddressSummary() {
  return {
    customersWithAddresses: 0,
    customersWithoutAddresses: 0,
    customersWithMultipleAddresses: 0,
    customersWithPrincipalAddress: 0,
    customersWithMultiplePrincipalAddresses: 0,
    customersWithNoPrincipalAddressAmongNonEmpty: 0,
    addressesWithCompleteCityObject: 0,
    addressesWithCompleteStateObject: 0,
    addressesWithCompleteCountryObject: 0,
    addressesWithTagPulseCoreLocation: 0,
    coreLocationDefinition: "TAGPULSE_INSPECTION_CONVENTION" as const,
    principal: emptyElementBoolean(),
    exterior: emptyElementBoolean(),
    tipoCadastro: emptyObject("$.enderecos[].tipo_cadastro"),
  };
}

function finalizeContact(
  summary: ReturnType<typeof emptyContactSummary>,
): ClientesCharacterizationProfile["contacts"] {
  return {
    ...summary,
    tipoCadastro: finalizeObject(summary.tipoCadastro),
    tipoContato: finalizeObject(summary.tipoContato),
  };
}

function finalizeAddress(
  summary: ReturnType<typeof emptyAddressSummary>,
): ClientesCharacterizationProfile["addresses"] {
  return { ...summary, tipoCadastro: finalizeObject(summary.tipoCadastro) };
}

function emptyElementBoolean(): ElementBooleanStatistics {
  return {
    trueCount: 0,
    falseCount: 0,
    nullCount: 0,
    missingCount: 0,
    otherTypeCount: 0,
  };
}

function inspectElementBoolean(
  stats: ElementBooleanStatistics,
  object: Record<string, unknown>,
  key: string,
): void {
  if (!has(object, key)) stats.missingCount += 1;
  else if (object[key] === true) stats.trueCount += 1;
  else if (object[key] === false) stats.falseCount += 1;
  else if (object[key] === null) stats.nullCount += 1;
  else stats.otherTypeCount += 1;
}

function createCrossFields(): ClientesCharacterizationProfile["crossField"] {
  return {
    documents: { CPF_ONLY: 0, CNPJ_ONLY: 0, BOTH: 0, NEITHER: 0 },
    codes: emptyBinary(),
    emailUsableByContactsNonEmpty: emptyBinary(),
    phoneUsableByContactsNonEmpty: emptyBinary(),
    emailOrPhoneUsableByContactsNonEmpty: emptyBinary(),
    contactsNonEmptyByPrincipalExists: emptyBinary(),
    contactsMultipleByPrincipalExists: emptyBinary(),
    addressesNonEmptyByPrincipalExists: emptyBinary(),
    addressesMultipleByPrincipalExists: emptyBinary(),
    customerExteriorByExteriorAddressExists: emptyBinary(),
    ativoByRecebeEmail: emptyBinary(),
    cnpjUsableByIeUsable: emptyBinary(),
    cnpjUsableByCnaeUsable: emptyBinary(),
  };
}

function cloneCross(
  value: ClientesCharacterizationProfile["crossField"],
): ClientesCharacterizationProfile["crossField"] {
  return Object.fromEntries(
    Object.entries(value).map(([key, counts]) => [key, { ...counts }]),
  ) as ClientesCharacterizationProfile["crossField"];
}

function emptyBinary(): BinaryAggregate {
  return {
    leftTrueRightTrue: 0,
    leftTrueRightFalse: 0,
    leftFalseRightTrue: 0,
    leftFalseRightFalse: 0,
  };
}

function tally(stats: BinaryAggregate, left: boolean, right: boolean): void {
  if (left && right) stats.leftTrueRightTrue += 1;
  else if (left) stats.leftTrueRightFalse += 1;
  else if (right) stats.leftFalseRightTrue += 1;
  else stats.leftFalseRightFalse += 1;
}

function elementSegments(path: ArrayElementPath): string[] {
  return path
    .replace(/^\$\.(?:contatos|enderecos)\[\]\.?/, "")
    .split(".")
    .filter(Boolean);
}

function lookupPath(
  object: Record<string, unknown>,
  segments: string[],
): { present: boolean; value: unknown } {
  let current: unknown = object;
  for (const segment of segments) {
    if (!isObject(current) || !has(current, segment))
      return { present: false, value: undefined };
    current = current[segment];
  }
  return { present: true, value: current };
}

function typeOf(value: unknown): ObservedJsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

function distinctResult(counts: Map<unknown, number>): DistinctStatistics {
  const occurrences = [...counts.values()];
  return {
    nonNullCount: occurrences.reduce((sum, count) => sum + count, 0),
    distinctCount: counts.size,
    duplicateOccurrences: occurrences.reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    ),
    duplicateGroups: occurrences.filter((count) => count > 1).length,
  };
}

function clearSensitiveSets(
  scalar: Map<ScalarValuePath, MutableValue>,
  identity: { id: Map<unknown, number>; idEntidade: Map<unknown, number> },
  entitiesById: Map<unknown, Set<unknown>>,
  idsByEntity: Map<unknown, Set<unknown>>,
  contacts: ReturnType<typeof emptyContactSummary>,
  addresses: ReturnType<typeof emptyAddressSummary>,
  category: MutableObject,
): void {
  for (const stats of scalar.values()) stats.distinct?.clear();
  identity.id.clear();
  identity.idEntidade.clear();
  entitiesById.clear();
  idsByEntity.clear();
  for (const stats of [
    contacts.tipoCadastro,
    contacts.tipoContato,
    addresses.tipoCadastro,
    category,
  ]) {
    stats.ids.clear();
    stats.descriptions.clear();
    stats.parentIds?.clear();
  }
}

function increment(map: Map<unknown, number>, value: unknown): void {
  map.set(value, (map.get(value) ?? 0) + 1);
}
function relate(
  map: Map<unknown, Set<unknown>>,
  left: unknown,
  right: unknown,
): void {
  const related = map.get(left) ?? new Set();
  related.add(right);
  map.set(left, related);
}
function countMultiple(map: Map<unknown, Set<unknown>>): number {
  return [...map.values()].filter((set) => set.size > 1).length;
}
function sumRelations(map: Map<unknown, Set<unknown>>): number {
  return [...map.values()].reduce((sum, set) => sum + set.size, 0);
}
function emptyCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}
function has(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function usable(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function min(current: number | null, value: number): number {
  return current === null ? value : Math.min(current, value);
}
function max(current: number | null, value: number): number {
  return current === null ? value : Math.max(current, value);
}
