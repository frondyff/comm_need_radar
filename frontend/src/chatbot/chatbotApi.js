export const CHATBOT_API_STATUS = {
  placeholder: "placeholder",
  ready: "ready",
  error: "error",
};

export function createChatbotContext({ selectedAreaLabel, language }) {
  return {
    selectedAreaLabel,
    language,
  };
}

// Future RAG retrieval calls should be routed through this module so the
// chatbot UI can stay focused on presentation and interaction state.
export async function sendChatbotMessage() {
  return {
    status: CHATBOT_API_STATUS.placeholder,
    answer: "",
    sources: [],
  };
}
