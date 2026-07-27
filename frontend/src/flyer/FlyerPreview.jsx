import { useEffect, useState } from "react";
import { Marker, MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { BookOpen, BriefcaseBusiness, Clock3, Heart, MapPin, Phone, UsersRound } from "lucide-react";
import { CATEGORY_COLORS, CategoryIcon, createServiceMarker, createUserLocationMarker, MAP_LEGEND_ITEMS } from "../components/serviceVisuals";
import { FLYER_MAP_ZOOM, getFlyerServiceLabelPlacement, getVisibleFlyerLegendItems, isFlyerMapPointVisible, nextFlyerMapZoom } from "./flyerMapState";
import { FLYER_COLORS, FLYER_PREVIEW_ELEMENT_ID, flyerPreviewStyle } from "./flyerStyles";

function FitFlyerBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    const valid = points.filter(([lat, lng]) => lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng));
    if (valid.length === 1) map.setView(valid[0], 14);
    // A closer initial fit keeps short, real point-to-point connectors
    // visible instead of burying them beneath the service markers.
    if (valid.length > 1) map.fitBounds(L.latLngBounds(valid), { padding: [24, 24], maxZoom: 16 });
    // Leaflet needs to react to the point values, not the array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);

  return null;
}

// Multiple organizations can share one building/address (e.g. a community
// centre housing several orgs), which puts their markers at the exact same
// lat/lng — and since the selected-service marker renders on top and is
// bigger, it can fully hide identically-placed nearby markers underneath
// it. A fixed real-world offset (in meters) isn't reliable here because the
// same number of meters can shrink to just a couple of screen pixels at
// certain zoom levels. This instead measures the actual on-screen pixel
// distance to the main marker and nudges only markers that are closer than
// `minPixelGap` apart, recomputing whenever the map pans or zooms.
function DeclutteredNearbyMarkers({ mainPosition, nearbyServices, minPixelGap = 22 }) {
  const map = useMap();
  const [positions, setPositions] = useState(() => nearbyServices.map((d) => [d.lat, d.lng]));

  useEffect(() => {
    let animationFrame;
    const recompute = () => {
      const mainPoint = map.latLngToContainerPoint(mainPosition);
      const next = nearbyServices.map((destination, index) => {
        const original = [destination.lat, destination.lng];
        const point = map.latLngToContainerPoint(original);
        const dx = point.x - mainPoint.x;
        const dy = point.y - mainPoint.y;
        const distancePx = Math.sqrt(dx * dx + dy * dy);
        if (distancePx >= minPixelGap) return original;
        const angle = (2 * Math.PI * index) / Math.max(nearbyServices.length, 1) + Math.PI / 5;
        const nudged = L.point(mainPoint.x + minPixelGap * Math.cos(angle), mainPoint.y + minPixelGap * Math.sin(angle));
        const nudgedLatLng = map.containerPointToLatLng(nudged);
        return [nudgedLatLng.lat, nudgedLatLng.lng];
      });
      setPositions(next);
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(recompute);
    };
    ["moveend", "zoomend", "resize"].forEach((eventName) => map.on(eventName, scheduleUpdate));
    scheduleUpdate();
    return () => {
      cancelAnimationFrame(animationFrame);
      ["moveend", "zoomend", "resize"].forEach((eventName) => map.off(eventName, scheduleUpdate));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mainPosition[0], mainPosition[1], JSON.stringify(nearbyServices.map((d) => [d.id, d.lat, d.lng]))]);

  return nearbyServices.map((destination, index) => (
    <Marker
      key={destination.id}
      position={positions[index] || [destination.lat, destination.lng]}
      icon={createServiceMarker(destination.category, false)}
      opacity={0.65}
    />
  ));
}

export function FlyerPreview({ flyer }) {
  if (!flyer) return null;
  return <UniversalFlyerPreview flyer={flyer} />;
}

function UniversalFlyerPreview({ flyer }) {
  const { service, location, audienceTags, servicesOffered, nearbyServices } = flyer;
  const categoryColor = CATEGORY_COLORS[service.category] || CATEGORY_COLORS.Other;

  return <div id={FLYER_PREVIEW_ELEMENT_ID} style={flyerPreviewStyle}>
    <FlyerMap location={location} service={service} nearbyServices={nearbyServices} />

    <section style={{ background: categoryColor, color: "#fff", display: "grid", gap: 9, gridTemplateColumns: "54px minmax(0, 1fr)", padding: "10px 16px" }}>
      <div style={{ alignSelf: "center", border: "2px solid #fff", borderRadius: "50%", display: "grid", height: 44, placeItems: "center", width: 44 }}>
        <CategoryIcon category={service.category} size={25} color="#fff" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: -0.35, lineHeight: 1.1, marginBottom: 5 }}>{service.name}</div>
        <FlyerContact icon={MapPin}>{getStreetAddress(service.address)}</FlyerContact>
        {service.hours && <FlyerContact icon={Clock3}>{service.hours}</FlyerContact>}
        {service.phone && <FlyerContact icon={Phone}><a href={`tel:${service.phone.replace(/\s/g, "")}`} style={{ color: "inherit", textDecoration: "none" }}>{service.phone}</a></FlyerContact>}
      </div>
    </section>

    <main style={{ padding: "9px 16px 0" }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1.08fr 0.92fr" }}>
        <section style={{ minWidth: 0 }}>
          <h1 style={{ color: FLYER_COLORS.black, fontSize: 19.5, fontWeight: 850, letterSpacing: -0.7, lineHeight: 0.98, margin: "0 0 8px" }}>Community<br />service support</h1>
          <p style={{ color: FLYER_COLORS.black, fontSize: 10, fontWeight: 600, lineHeight: 1.23, margin: "0 0 9px" }}>Practical help for people in your community.</p>
          <div style={{ background: categoryColor, height: 2, marginBottom: 8, width: 38 }} />
          {audienceTags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{audienceTags.map((tag) => <span key={tag} style={tagStyle}>{tag}</span>)}</div>}
        </section>
        <section style={{ borderLeft: `1px solid ${FLYER_COLORS.border}`, minWidth: 0, paddingLeft: 13 }}>
          <h2 style={{ borderBottom: `2px solid ${categoryColor}`, color: categoryColor, fontSize: 13, lineHeight: 1, margin: "0 0 2px", paddingBottom: 4 }}>Services offered</h2>
          <ServicesList items={servicesOffered} color={categoryColor} />
        </section>
      </div>

      {nearbyServices.length > 0 && <section style={{ marginTop: 7 }}>
        <h2 style={{ borderBottom: `1px solid ${FLYER_COLORS.black}`, color: FLYER_COLORS.black, fontSize: 13, lineHeight: 1, margin: "0 0 2px", paddingBottom: 2 }}>Also on this map</h2>
        {nearbyServices.map((destination) => <AlternativeCentre key={destination.id} destination={destination} />)}
      </section>}
    </main>
    <a href="tel:211" aria-label="Call 211 for more information" style={{ alignItems: "center", background: FLYER_COLORS.footer, color: "#fff", display: "flex", fontSize: 9.5, fontWeight: 700, gap: 9, justifyContent: "center", marginTop: 7, padding: "8px 16px", textDecoration: "none" }}><Phone size={18} fill="#fff" color="#fff" strokeWidth={1.7} aria-hidden="true" />Call 211 for more</a>
  </div>;
}

const tagStyle = { background: "#F0F1F3", borderRadius: 999, color: "#303030", fontSize: 7.3, fontWeight: 700, padding: "3px 6px", whiteSpace: "nowrap" };

function FlyerMap({ location, service, nearbyServices }) {
  const destinations = [service, ...nearbyServices];
  const points = [[location.lat, location.lng], ...destinations.map(({ lat, lng }) => [lat, lng])];
  const selectedServiceColor = CATEGORY_COLORS[service.category] || CATEGORY_COLORS.Other;
  const legendItems = getVisibleFlyerLegendItems({ destinations, legendItems: MAP_LEGEND_ITEMS });

  return <div aria-label={`Leaflet map from ${location.name} to ${service.name}`} style={{ height: 245, overflow: "hidden", position: "relative" }}>
    <MapContainer key={`${location.id}-${service.id}`} center={[location.lat, location.lng]} zoom={15} minZoom={FLYER_MAP_ZOOM.min} maxZoom={FLYER_MAP_ZOOM.max} style={{ height: "100%", width: "100%" }} zoomControl={false} dragging scrollWheelZoom={false} doubleClickZoom={false}>
      <TileLayer attribution="" crossOrigin="anonymous" url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
      <FitFlyerBounds points={points} />
      <FlyerMapZoomControls />
      <FlyerServiceLabel service={service} color={selectedServiceColor} />
      <Marker position={[location.lat, location.lng]} icon={createUserLocationMarker()} />
      <DeclutteredNearbyMarkers mainPosition={[service.lat, service.lng]} nearbyServices={nearbyServices} />
      <Marker position={[service.lat, service.lng]} icon={createServiceMarker(service.category, true)} />
    </MapContainer>
    <FlyerMapLegend items={legendItems} />
  </div>;
}

function FlyerMapZoomControls() {
  const map = useMap();
  const changeZoom = (direction) => map.setZoom(nextFlyerMapZoom(map.getZoom(), direction), { animate: false });

  return <div className="flyer-map-controls" aria-label="Flyer map zoom controls" style={{ display: "grid", gap: 3, position: "absolute", right: 8, top: 8, zIndex: 1000 }}>
    <button type="button" aria-label="Zoom in flyer map" onClick={() => changeZoom(1)} style={mapControlButtonStyle}>+</button>
    <button type="button" aria-label="Zoom out flyer map" onClick={() => changeZoom(-1)} style={mapControlButtonStyle}>−</button>
  </div>;
}

const mapControlButtonStyle = { background: "rgba(255,255,255,0.96)", border: "1px solid #B8BDC5", borderRadius: 3, color: FLYER_COLORS.black, cursor: "pointer", fontSize: 16, fontWeight: 800, height: 24, lineHeight: 1, padding: 0, width: 24 };

function FlyerServiceLabel({ service, color }) {
  const map = useMap();
  const [placement, setPlacement] = useState(null);

  useEffect(() => {
    let animationFrame;
    const updatePlacement = () => {
      const point = map.latLngToContainerPoint([service.lat, service.lng]);
      const mapSize = map.getSize();
      setPlacement(isFlyerMapPointVisible({ point, mapSize })
        ? getFlyerServiceLabelPlacement({ point, mapSize, labelWidth: 174 })
        : null);
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(updatePlacement);
    };

    ["moveend", "resize", "zoomend"].forEach((eventName) => map.on(eventName, scheduleUpdate));
    scheduleUpdate();
    return () => {
      cancelAnimationFrame(animationFrame);
      ["moveend", "resize", "zoomend"].forEach((eventName) => map.off(eventName, scheduleUpdate));
    };
  }, [map, service.lat, service.lng]);

  if (!placement) return null;
  return <span data-flyer-service-label="true" style={{ background: "rgba(255,255,255,0.98)", border: `1.5px solid ${color}`, borderRadius: 4, boxShadow: "0 1px 3px rgba(0,0,0,0.14)", boxSizing: "border-box", color: FLYER_COLORS.black, fontFamily: "Arial, sans-serif", fontSize: 8.5, fontWeight: 700, left: placement.left, lineHeight: 1.15, padding: "3px 5px", pointerEvents: "none", position: "absolute", top: placement.top, whiteSpace: "normal", width: 170, zIndex: 500 }}>{service.name}</span>;
}

function FlyerMapLegend({ items }) {
  return <div className="flyer-map-legend" aria-label="Flyer map legend" style={{ background: "rgba(255,255,255,0.94)", border: "1px solid rgba(17,17,17,0.18)", borderRadius: 3, bottom: 7, color: FLYER_COLORS.black, display: "grid", fontFamily: "Arial, sans-serif", fontSize: 6.6, gap: 2, left: 7, lineHeight: 1.1, padding: "4px 5px", pointerEvents: "none", position: "absolute", zIndex: 1000 }}>
    {items.map((item) => <span key={item.label} style={{ alignItems: "center", display: "flex", gap: 3 }}><span aria-hidden="true" style={{ background: item.color, border: "1px solid rgba(0,0,0,0.18)", borderRadius: "50%", display: "inline-block", flexShrink: 0, height: 6, width: 6 }} />{item.label}</span>)}
  </div>;
}

function getStreetAddress(address) {
  return String(address || "Address not listed").split(",")[0].trim();
}

function FlyerContact({ icon: Icon, children }) {
  return <div style={{ alignItems: "center", display: "flex", fontSize: 9.4, gap: 5, lineHeight: 1.25, marginTop: 2 }}><Icon size={12} fill="currentColor" strokeWidth={2.3} aria-hidden="true" />{children}</div>;
}

function ServicesList({ items, color }) {
  const icons = [UsersRound, BookOpen, BriefcaseBusiness, Heart];
  if (items.length === 0) return <div style={{ color: FLYER_COLORS.lightText, fontSize: 8.5, lineHeight: 1.2, padding: "5px 0" }}>Contact this service for details.</div>;
  return <div>{items.map((item, index) => {
    const Icon = icons[index] || Heart;
    return <div key={item} style={{ alignItems: "center", borderBottom: index === items.length - 1 ? "none" : `1px solid ${FLYER_COLORS.border}`, display: "grid", gap: 5, gridTemplateColumns: "21px minmax(0, 1fr)", padding: "3px 0" }}><span style={{ alignItems: "center", background: color, borderRadius: "50%", color: "#fff", display: "flex", height: 18, justifyContent: "center", width: 18 }}><Icon size={11} strokeWidth={2.5} aria-hidden="true" /></span><span style={{ color: FLYER_COLORS.black, fontSize: 8.5, fontWeight: 700, lineHeight: 1.1 }}>{item}</span></div>;
  })}</div>;
}

function ServicePin({ category, color }) {
  return <span style={{ display: "grid", height: 29, width: 26 }}><MapPin size={26} color={color} fill={color} strokeWidth={1.4} style={{ gridArea: "1 / 1" }} /><span style={{ alignSelf: "start", display: "flex", gridArea: "1 / 1", justifySelf: "center", marginTop: 5 }}><CategoryIcon category={category} size={12} color="#fff" /></span></span>;
}

function AlternativeCentre({ destination }) {
  const categoryColor = CATEGORY_COLORS[destination.category] || CATEGORY_COLORS.Other;
  const description = destination.tags?.[0] || destination.type;
  const phone = destination.phone && destination.phone !== "Phone not listed" ? destination.phone : null;
  return <div style={{ alignItems: "center", borderBottom: `1px solid ${FLYER_COLORS.border}`, display: "grid", gap: 6, gridTemplateColumns: "30px minmax(0, 1fr)", padding: "3px 0" }}><ServicePin category={destination.category} color={categoryColor} /><div style={{ minWidth: 0 }}><div style={{ color: FLYER_COLORS.black, fontSize: 10.3, fontWeight: 800, lineHeight: 1.1 }}>{destination.name}</div><div style={{ color: FLYER_COLORS.black, fontSize: 8.4, lineHeight: 1.15, marginTop: 1 }}>{description}</div><div style={{ alignItems: "center", color: FLYER_COLORS.black, display: "flex", fontSize: 7.8, fontWeight: 600, gap: 3, lineHeight: 1.1, marginTop: 1 }}><MapPin size={9} fill="currentColor" strokeWidth={2.6} aria-hidden="true" />{getStreetAddress(destination.address)}{phone && <> · <a href={`tel:${phone.replace(/\s/g, "")}`} style={{ color: "inherit", textDecoration: "none" }}>{phone}</a></>}</div></div></div>;
}
