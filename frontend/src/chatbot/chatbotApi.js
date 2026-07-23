export const CHATBOT_API_STATUS = {
  ready: "ready",
  error: "error",
};

export function createChatbotContext({ selectedAreaId, selectedAreaLabel, language }) {
  return {
    selectedAreaId,
    selectedAreaLabel,
    language,
  };
}

export async function sendChatbotMessage({
  message,
  selectedAreaId,
  serviceCategory = "All",
  radiusKm = 5,
  language = "en",
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        selectedAreaId,
        serviceCategory,
        radiusKm,
        language,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Chat request failed (${response.status})`);
    }

    return {
      status: CHATBOT_API_STATUS.ready,
      answer: String(payload.answer || ""),
      serviceIds: Array.isArray(payload.service_ids) ? payload.service_ids : [],
      limitations: Array.isArray(payload.limitations) ? payload.limitations : [],
      fallbackUsed: Boolean(payload.fallback_used),
      source: payload.source || "unknown",
    };
  } catch (error) {
    const messageText = error?.name === "AbortError"
      ? "The assistant timed out. Please try again."
      : error instanceof Error
        ? error.message
        : "The assistant is unavailable.";
    return {
      status: CHATBOT_API_STATUS.error,
      answer: "",
      serviceIds: [],
      limitations: [messageText],
      fallbackUsed: true,
      source: "error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
