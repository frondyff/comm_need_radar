import { useState } from "react";
import { Bot } from "lucide-react";
import {
  chatBarStyle,
  chatIconStyle,
  chatInputStyle,
  closeButtonStyle,
  floatingButtonStyle,
} from "./chatbotStyles.js";

export function ChatbotWidget({ isEN, selectedAreaLabel }) {
  const [chat, setChat] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  if (chatOpen) {
    return (
      <div style={chatBarStyle}>
        <Bot size={18} color="#2563EB" style={chatIconStyle} />
        <input
          autoFocus
          value={chat}
          onChange={event => setChat(event.target.value)}
          placeholder={isEN ? `Ask about ${selectedAreaLabel}…` : `Poser une question sur ${selectedAreaLabel}…`}
          style={chatInputStyle}
        />
        <button
          onClick={() => setChatOpen(false)}
          aria-label={isEN ? "Close chat" : "Fermer le chat"}
          style={closeButtonStyle}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setChatOpen(true)}
      aria-label={isEN ? "Open chat" : "Ouvrir le chat"}
      style={floatingButtonStyle}
    >
      <Bot size={24} color="#fff" />
    </button>
  );
}
