const VERIFIED_SERVICE_FIELDS = new Set([
  "service_name",
  "service_category",
  "service_categories",
  "address",
  "phone",
  "hours",
  "services",
  "sources",
  "distance_km",
]);

export function parseModelJson(content) {
  const trimmed = String(content)
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "");
  return JSON.parse(trimmed);
}

export function validateModelAnswer(parsed, allowedServiceIds) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("model output is not an object");
  }
  if (typeof parsed.answer !== "string" || !parsed.answer.trim()) {
    throw new Error("model answer is missing");
  }

  const serviceIds = Array.isArray(parsed.service_ids) ? parsed.service_ids : [];
  if (
    serviceIds.some(serviceId =>
      typeof serviceId !== "string" || !allowedServiceIds.has(serviceId)
    )
  ) {
    throw new Error("model referenced an unknown service");
  }

  const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
  if (serviceIds.length > 0 && evidence.length === 0) {
    throw new Error("model service claims have no evidence");
  }

  const evidencedServiceIds = new Set();
  for (const item of evidence) {
    if (!item || typeof item !== "object") {
      throw new Error("model evidence is malformed");
    }
    const serviceId = item.service_id;
    if (typeof serviceId !== "string" || !allowedServiceIds.has(serviceId)) {
      throw new Error("model evidence referenced an unknown service");
    }
    const fields = Array.isArray(item.fields_used) ? item.fields_used : [];
    if (
      fields.length === 0
      || fields.some(field =>
        typeof field !== "string" || !VERIFIED_SERVICE_FIELDS.has(field)
      )
    ) {
      throw new Error("model evidence used an unsupported field");
    }
    evidencedServiceIds.add(serviceId);
  }
  if (serviceIds.some(serviceId => !evidencedServiceIds.has(serviceId))) {
    throw new Error("model service claim is not evidenced");
  }

  return {
    answer: parsed.answer.trim(),
    serviceIds,
    evidence,
    verificationQuestions: Array.isArray(parsed.verification_questions)
      ? parsed.verification_questions.filter(value => typeof value === "string")
      : [],
    limitations: Array.isArray(parsed.limitations)
      ? parsed.limitations.filter(value => typeof value === "string")
      : [],
  };
}
