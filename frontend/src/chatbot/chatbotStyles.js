export const chatBarStyle = {
  position: "fixed",
  bottom: 20,
  right: 20,
  zIndex: 2000,
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 24,
  padding: "10px 10px 10px 16px",
  boxShadow: "0 6px 24px rgba(15,23,42,0.15)",
  width: 340,
  maxWidth: "calc(100vw - 40px)",
};

export const chatIconStyle = {
  flexShrink: 0,
};

export const chatInputStyle = {
  flex: 1,
  border: "none",
  outline: "none",
  fontSize: 14,
  background: "transparent",
  minWidth: 0,
};

export const closeButtonStyle = {
  flexShrink: 0,
  width: 26,
  height: 26,
  borderRadius: "50%",
  border: "none",
  background: "#F1F5F9",
  color: "#64748B",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const floatingButtonStyle = {
  position: "fixed",
  bottom: 20,
  right: 20,
  zIndex: 2000,
  width: 52,
  height: 52,
  borderRadius: "50%",
  border: "none",
  background: "#2563EB",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 6px 20px rgba(37,99,235,0.4)",
};
