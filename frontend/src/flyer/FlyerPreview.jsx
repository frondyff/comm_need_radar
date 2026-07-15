import { Marker, MapContainer, TileLayer } from "react-leaflet";
import { Phone, QrCode } from "lucide-react";
import { CategoryIcon, CATEGORY_COLORS, createServiceMarker, createUserLocationMarker } from "../components/serviceVisuals";
import { getFlyerNearbyServices } from "./flyerData";
import { FLYER_COLORS, FLYER_PREVIEW_ELEMENT_ID, flyerPreviewStyle } from "./flyerStyles";

export function FlyerPreview({ service, location, services, language, updatedLabel }) {
  const isEnglish = language === "EN";
  const nearbyServices = getFlyerNearbyServices(services, service);
  const categoryColor = CATEGORY_COLORS[service.category] || "#2563EB";
  const mapCenter = [(location.lat + service.lat) / 2, (location.lng + service.lng) / 2];

  return (
    <div id={FLYER_PREVIEW_ELEMENT_ID} style={flyerPreviewStyle}>
      <div style={{ background: categoryColor, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>
            Community Radar · {isEnglish ? "Community Services" : "Services communautaires"}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{service.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{service.type}</div>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CategoryIcon category={service.category} size={20} color="#fff" />
        </div>
      </div>

      <div style={{ height: 160, position: "relative", zIndex: 0 }}>
        <MapContainer key={`${service.id}-${location.id}`} center={mapCenter} zoom={14} style={{ height: "100%", width: "100%" }} zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false}>
          <TileLayer attribution="" crossOrigin="anonymous" url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <Marker position={[location.lat, location.lng]} icon={createUserLocationMarker()} />
          <Marker position={[service.lat, service.lng]} icon={createServiceMarker(service.category, true)} />
        </MapContainer>
        <div style={{ position: "absolute", bottom: 6, left: 6, zIndex: 1000, background: "rgba(255,255,255,0.95)", borderRadius: 4, padding: "3px 7px", fontSize: 10, border: `1px solid ${FLYER_COLORS.border}`, display: "flex", gap: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: FLYER_COLORS.success, display: "inline-block" }} />{isEnglish ? "You are here" : "Vous êtes ici"}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: categoryColor, display: "inline-block" }} />{service.type}</span>
        </div>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {service.address && <FlyerDetail icon="📍">{service.address}</FlyerDetail>}
        {service.hours && <FlyerDetail icon="🕐">{service.hours}</FlyerDetail>}
        {service.phone && <FlyerDetail icon="📞" isLast>{service.phone}</FlyerDetail>}
        {service.tags?.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {service.tags.slice(0, 4).map((tag) => (
              <span key={tag} style={{ padding: "2px 8px", borderRadius: 10, background: `${categoryColor}15`, color: categoryColor, fontSize: 10, fontWeight: 600, border: `1px solid ${categoryColor}40` }}>{tag}</span>
            ))}
          </div>
        )}
        {service.langs?.length > 0 && <div style={{ fontSize: 10, color: FLYER_COLORS.lightText, marginBottom: 10 }}>🌐 {service.langs.join(" · ")}</div>}

        {nearbyServices.length > 0 && (
          <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: 8, marginTop: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: FLYER_COLORS.lightText, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{isEnglish ? "Also nearby" : "Aussi à proximité"}</div>
            {nearbyServices.map((nearbyService) => (
              <div key={nearbyService.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: CATEGORY_COLORS[nearbyService.category], flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: FLYER_COLORS.darkText }}>{nearbyService.name}</span>
                {nearbyService.dist && <span style={{ fontSize: 10, color: FLYER_COLORS.lightText }}>· {nearbyService.dist}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: FLYER_COLORS.footer, borderTop: `1px solid ${FLYER_COLORS.border}`, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: FLYER_COLORS.mutedText, fontStyle: "italic" }}>{updatedLabel}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${FLYER_COLORS.border}`, background: "#fff", fontSize: 10, color: FLYER_COLORS.darkText, display: "flex", alignItems: "center", gap: 4 }}><Phone size={10} color={FLYER_COLORS.mutedText} /> 211</div>
          <div style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${FLYER_COLORS.border}`, background: "#fff", fontSize: 10, color: FLYER_COLORS.darkText, display: "flex", alignItems: "center", gap: 4 }}><QrCode size={10} color={FLYER_COLORS.mutedText} /> App</div>
        </div>
      </div>
    </div>
  );
}

function FlyerDetail({ icon, children, isLast = false }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: isLast ? 8 : 6, alignItems: "flex-start" }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 12, color: FLYER_COLORS.darkText, lineHeight: 1.4 }}>{children}</span>
    </div>
  );
}
