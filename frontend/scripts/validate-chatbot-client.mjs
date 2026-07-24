import {
  CHATBOT_API_STATUS,
  sendChatbotMessage,
} from "../src/chatbot/chatbotApi.js";
import { readFile } from "node:fs/promises";

const originalFetch = globalThis.fetch;
const failures = [];

try {
  let capturedRequest;
  globalThis.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      json: async () => ({
        answer: "Grounded response",
        service_ids: ["S001"],
        limitations: ["Confirm availability."],
        fallback_used: true,
        source: "deterministic",
      }),
    };
  };

  const success = await sendChatbotMessage({
    message: "Where can I find food support?",
    selectedAreaId: "A001",
    language: "en",
  });
  if (success.status !== CHATBOT_API_STATUS.ready || success.answer !== "Grounded response") {
    failures.push("Successful chatbot response did not map into the client contract");
  }
  if (capturedRequest?.url !== "/api/chat" || capturedRequest?.options?.method !== "POST") {
    failures.push("Chatbot client did not use the same-origin POST /api/chat boundary");
  }
  const requestBody = JSON.parse(capturedRequest?.options?.body || "{}");
  if (requestBody.selectedAreaId !== "A001" || requestBody.message.length === 0) {
    failures.push("Chatbot request omitted its bounded area/message context");
  }

  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: "supabase_not_configured" }),
  });
  const failure = await sendChatbotMessage({
    message: "Test failure",
    selectedAreaId: "A001",
  });
  if (failure.status !== CHATBOT_API_STATUS.error || failure.limitations.length === 0) {
    failures.push("Chatbot client did not expose a safe API error state");
  }

  const groundedSource = await readFile(
    new URL("../src/chatbot/groundedChatbot.js", import.meta.url),
    "utf8"
  );
  if (!groundedSource.includes('q.ilike("age_groups", `%${audience.age}%`)')) {
    failures.push("Grounded chatbot does not apply the selected age-group filter");
  }

  const widgetSource = await readFile(
    new URL("../src/chatbot/ChatbotWidget.jsx", import.meta.url),
    "utf8"
  );
  if (
    !widgetSource.includes("Highest income pressure")
    || widgetSource.includes('["Lowest income"')
  ) {
    failures.push("Grounded chatbot ranking label does not match income-pressure semantics");
  }
} finally {
  globalThis.fetch = originalFetch;
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`FAIL ${failure}`));
  process.exit(1);
}

console.log("PASS chatbot client request, response, and error contracts");
