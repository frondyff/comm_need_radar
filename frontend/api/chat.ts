import { createClient } from "@supabase/supabase-js";

type ChatRequest = {
  message?: string;
  selectedAreaId?: string;
  serviceCategory?: string;
  radiusKm?: number;
  language?: "en" | "fr";
};

type ServiceRow = {
  service_id: string;
  service_name: string;
  service_category: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  website: string;
  language: string;
  source_name: string;
  source_url: string;
  last_checked_date: string;
  distance_km?: number;
};

type GapRow = {
  area_id: string;
  area_name: string;
  borough_name: string;
  latitude: number;
  longitude: number;
  vulnerability_score: number;
  overall_accessibility_score: number;
  gap_score: number;
  gap_rank: number;
  priority_flag: string;
  gap_drivers: string;
  summary_en: string;
  summary_fr: string;
};

const PAGE_SIZE = 1000;
const MAX_PROMPT_CHARS = 900;
const MAX_RADIUS_KM = 50;
const DEFAULT_MODEL = "gpt-4.1-mini";
const ALLOWED_EVIDENCE_FIELDS = new Set([
  "service_id",
  "service_name",
  "service_category",
  "address",
  "phone",
  "language",
  "distance_km",
  "last_checked_date"
]);

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function json(res: any, status: number, payload: unknown) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function deterministicAnswer(area: GapRow, services: ServiceRow[], serviceCategory: string, language: "en" | "fr") {
  const topServices = services.slice(0, 3).map((service) => `${service.service_name} (${service.service_category}, ${service.distance_km?.toFixed(1)} km)`);
  if (language === "fr") {
    return `${area.area_name} a un score d'ecart de ${area.gap_score.toFixed(1)} et un rang ${area.gap_rank}. Services verifies proches: ${topServices.join("; ") || "aucun service dans le contexte limite"}. Confirmez les details directement avec le fournisseur avant reference.`;
  }
  return `${area.area_name} has a gap score of ${area.gap_score.toFixed(1)} and ranks #${area.gap_rank}. Verified nearby services${serviceCategory !== "All" ? ` for ${serviceCategory}` : ""}: ${topServices.join("; ") || "none in the bounded context"}. Confirm details with the provider before referral.`;
}

function parseModelJson(content: string) {
  const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  return JSON.parse(trimmed) as {
    answer?: string;
    service_ids?: string[];
    evidence?: Array<{ service_id?: string; fields_used?: string[] }>;
    verification_questions?: string[];
    limitations?: string[];
    language?: "en" | "fr";
  };
}

async function loadPagedServices(client: any): Promise<ServiceRow[]> {
  const rows: ServiceRow[] = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await client.from("service_table").select("*").range(from, to);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as ServiceRow[]));
    if (!data || data.length < PAGE_SIZE) {
      break;
    }
    page += 1;
  }
  return rows;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "method_not_allowed" });
  }

  let body: ChatRequest;
  try {
    body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}) as ChatRequest;
  } catch {
    return json(res, 400, { error: "invalid_json" });
  }
  const message = String(body.message ?? "").trim();
  const selectedAreaId = String(body.selectedAreaId ?? "").trim();
  const serviceCategory = String(body.serviceCategory ?? "All");
  const radiusKm = Number(body.radiusKm ?? 5);
  const language = body.language === "fr" ? "fr" : "en";

  if (
    !message ||
    message.length > MAX_PROMPT_CHARS ||
    !selectedAreaId ||
    selectedAreaId.length > 80 ||
    serviceCategory.length > 80 ||
    !Number.isFinite(radiusKm) ||
    radiusKm <= 0 ||
    radiusKm > MAX_RADIUS_KM
  ) {
    return json(res, 400, { error: "invalid_request" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return json(res, 503, { error: "supabase_not_configured" });
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: area, error: areaError } = await client
    .from("gap_score")
    .select("*")
    .eq("area_id", selectedAreaId)
    .single();
  if (areaError) {
    if (areaError.code === "PGRST116") {
      return json(res, 404, { error: "area_not_found" });
    }
    return json(res, 502, { error: "data_source_unavailable" });
  }
  if (!area) {
    return json(res, 404, { error: "area_not_found" });
  }

  let allServices: ServiceRow[];
  try {
    allServices = await loadPagedServices(client);
  } catch {
    return json(res, 502, { error: "data_source_unavailable" });
  }
  const areaRow = area as GapRow;
  const candidates = allServices
    .filter((service) => serviceCategory === "All" || service.service_category === serviceCategory)
    .map((service) => ({
      ...service,
      distance_km: Number(haversineKm(areaRow.latitude, areaRow.longitude, Number(service.latitude), Number(service.longitude)).toFixed(2))
    }))
    .filter((service) => service.distance_km <= radiusKm)
    .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
    .slice(0, 12);

  const fallbackAnswer = deterministicAnswer(areaRow, candidates, serviceCategory, language);
  const llmApiKey = process.env.LLM_API_KEY;
  const llmBaseUrl = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
  const llmModel = process.env.LLM_MODEL ?? DEFAULT_MODEL;
  if (!llmApiKey) {
    return json(res, 200, {
      answer: fallbackAnswer,
      service_ids: candidates.slice(0, 3).map((service) => service.service_id),
      evidence: [],
      verification_questions: ["Confirm provider availability before referral."],
      limitations: ["LLM provider is not configured; deterministic fallback was used."],
      fallback_used: true,
      source: "deterministic"
    });
  }

  const allowedServiceIds = new Set(candidates.map((service) => service.service_id));
  const prompt = {
    area: {
      area_id: areaRow.area_id,
      area_name: areaRow.area_name,
      borough_name: areaRow.borough_name,
      gap_score: areaRow.gap_score,
      gap_rank: areaRow.gap_rank,
      priority_flag: areaRow.priority_flag,
      gap_drivers: areaRow.gap_drivers,
      summary: language === "fr" ? areaRow.summary_fr : areaRow.summary_en
    },
    services: candidates.slice(0, 8).map((service) => ({
      service_id: service.service_id,
      service_name: service.service_name,
      service_category: service.service_category,
      address: service.address,
      phone: service.phone,
      language: service.language,
      distance_km: service.distance_km,
      last_checked_date: service.last_checked_date
    })),
    user_question: message,
    language
  };

  try {
    const llmResponse = await fetch(`${llmBaseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${llmApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: llmModel,
        temperature: 0.1,
        max_tokens: 420,
        messages: [
          {
            role: "system",
            content:
              "You answer from verified JSON context only. Return valid JSON with answer, service_ids, evidence, verification_questions, limitations, and language. Do not invent services, eligibility, addresses, phone numbers, scores, or raw visitor facts."
          },
          { role: "user", content: JSON.stringify(prompt) }
        ]
      })
    });
    if (!llmResponse.ok) {
      throw new Error(`LLM request failed: ${llmResponse.status}`);
    }
    const completion = await llmResponse.json();
    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("LLM response missing content");
    }
    const parsed = parseModelJson(content);
    const serviceIds = Array.isArray(parsed.service_ids) ? parsed.service_ids : [];
    const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
    const validEvidence = evidence.every(
      (item) =>
        item &&
        typeof item.service_id === "string" &&
        allowedServiceIds.has(item.service_id) &&
        Array.isArray(item.fields_used) &&
        item.fields_used.every((field) => ALLOWED_EVIDENCE_FIELDS.has(field))
    );
    if (
      typeof parsed.answer !== "string" ||
      !parsed.answer.trim() ||
      parsed.answer.length > 4_000 ||
      serviceIds.some((serviceId) => typeof serviceId !== "string" || !allowedServiceIds.has(serviceId)) ||
      !validEvidence
    ) {
      throw new Error("LLM response failed evidence validation");
    }
    return json(res, 200, {
      answer: parsed.answer,
      service_ids: serviceIds,
      evidence,
      verification_questions: Array.isArray(parsed.verification_questions) ? parsed.verification_questions : [],
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations : [],
      fallback_used: false,
      source: "llm"
    });
  } catch (error) {
    return json(res, 200, {
      answer: fallbackAnswer,
      service_ids: candidates.slice(0, 3).map((service) => service.service_id),
      evidence: [],
      verification_questions: ["Confirm provider availability before referral."],
      limitations: [`LLM fallback used: ${error instanceof Error ? error.message : "unknown error"}`],
      fallback_used: true,
      source: "deterministic"
    });
  }
}
