import { useState } from "react";
import { Bot } from "lucide-react";
import {
  chatBarStyle,
  chatIconStyle,
  chatInputStyle,
  closeButtonStyle,
  floatingButtonStyle,
} from "./chatbotStyles.js";
import { sendChatbotMessage } from "./chatbotApi.js";

export function ChatbotWidget({ isEN, selectedAreaId, selectedAreaLabel }) {
  const [chat, setChat] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [limitations, setLimitations] = useState([]);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const submit = async event => {
    event.preventDefault();
    const message = chat.trim();
    if (!message || !selectedAreaId || isSending) return;

    setIsSending(true);
    setAnswer("");
    setLimitations([]);
    const result = await sendChatbotMessage({
      message,
      selectedAreaId,
      language: isEN ? "en" : "fr",
    });
    setAnswer(result.answer);
    setLimitations(result.limitations);
    setFallbackUsed(result.fallbackUsed);
    setIsSending(false);
  };

  if (chatOpen) {
    return (
      <div style={{...chatBarStyle,display:"block",padding:0,borderRadius:16,overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 14px",background:"#EFF6FF",borderBottom:"1px solid #DBEAFE"}}>
          <Bot size={18} color="#2563EB" style={chatIconStyle} />
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1E3A8A"}}>
              {isEN ? "Community Radar assistant" : "Assistant Community Radar"}
            </div>
            <div style={{fontSize:11,color:"#64748B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {selectedAreaLabel}
            </div>
          </div>
          <button
            onClick={() => setChatOpen(false)}
            aria-label={isEN ? "Close chat" : "Fermer le chat"}
            style={closeButtonStyle}
          >
            ✕
          </button>
        </div>

        {(answer || limitations.length > 0) && (
          <div aria-live="polite" style={{padding:"12px 14px",maxHeight:220,overflowY:"auto",fontSize:13,lineHeight:1.5,color:"#1E293B",background:"#fff"}}>
            {answer && <div>{answer}</div>}
            {fallbackUsed && answer && (
              <div style={{marginTop:8,fontSize:11,color:"#92400E"}}>
                {isEN ? "Deterministic fallback used." : "Réponse déterministe utilisée."}
              </div>
            )}
            {limitations.map(item => (
              <div key={item} style={{marginTop:6,fontSize:11,color:"#64748B"}}>{item}</div>
            ))}
          </div>
        )}

        <form onSubmit={submit} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px"}}>
          <input
            autoFocus
            value={chat}
            disabled={isSending || !selectedAreaId}
            onChange={event => setChat(event.target.value)}
            placeholder={isEN ? `Ask about ${selectedAreaLabel}…` : `Poser une question sur ${selectedAreaLabel}…`}
            style={chatInputStyle}
            maxLength={900}
          />
          <button
            type="submit"
            disabled={!chat.trim() || !selectedAreaId || isSending}
            style={{border:"none",borderRadius:8,padding:"7px 10px",background:isSending?"#94A3B8":"#2563EB",color:"#fff",fontSize:12,fontWeight:600,cursor:isSending?"wait":"pointer"}}
          >
            {isSending ? (isEN ? "Asking…" : "Envoi…") : (isEN ? "Ask" : "Envoyer")}
          </button>
        </form>
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
