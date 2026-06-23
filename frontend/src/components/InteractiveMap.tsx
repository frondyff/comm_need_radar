import { useEffect, useMemo, useRef } from "react";
import maplibregl, { Map, Marker } from "maplibre-gl";
import type { AreaFeatureCollection, AreaMetricKey, GapRow, ServiceRow } from "@/lib/data";

type AreaMapPoint = Pick<
  GapRow,
  "area_id" | "area_name" | "latitude" | "longitude" | "gap_score" | "priority_flag"
>;

type ServiceMapPoint = Pick<
  ServiceRow,
  "service_id" | "service_name" | "service_category" | "latitude" | "longitude" | "distance_km"
>;

type InteractiveMapProps =
  | {
      variant: "areas";
      points: AreaMapPoint[];
      selectedId: string;
      polygons: AreaFeatureCollection | null;
      metric: AreaMetricKey;
      onSelect: (id: string) => void;
    }
  | {
      variant: "services";
      points: ServiceMapPoint[];
      selectedId: string | null;
      area: Pick<GapRow, "area_id" | "area_name" | "latitude" | "longitude">;
      radiusKm: number;
      onSelect: (id: string) => void;
    };

function markerColor(value: number, selected: boolean): string {
  if (selected) return "#0f172a";
  if (value >= 70) return "#dc2626";
  if (value >= 55) return "#f97316";
  if (value >= 35) return "#eab308";
  return "#16a34a";
}

function createMarkerElement(label: string, color: string, size: number, selected: boolean): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = selected ? "map-marker selected" : "map-marker";
  element.style.setProperty("--marker-color", color);
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.setAttribute("aria-label", label);
  element.title = label;
  return element;
}

function removeLayerIfPresent(map: Map, id: string) {
  if (map.getLayer(id)) {
    map.removeLayer(id);
  }
}

function removeSourceIfPresent(map: Map, id: string) {
  if (map.getSource(id)) {
    map.removeSource(id);
  }
}

function createCircleFeature(lon: number, lat: number, radiusKm: number) {
  const points = 72;
  const coordinates: number[][] = [];
  const latRadius = radiusKm / 111.32;
  const lonRadius = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));

  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    coordinates.push([lon + Math.cos(angle) * lonRadius, lat + Math.sin(angle) * latRadius]);
  }

  return {
    type: "Feature" as const,
    properties: { radius_km: radiusKm },
    geometry: {
      type: "Polygon" as const,
      coordinates: [coordinates]
    }
  };
}

export default function InteractiveMap(props: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);

  const center = useMemo(() => {
    const areaPoint = props.variant === "services" ? [props.area] : [];
    const points = [...props.points, ...areaPoint].filter((point) => point.latitude && point.longitude);
    if (points.length === 0) {
      return { lat: 45.53, lon: -73.61 };
    }
    return {
      lat: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
      lon: points.reduce((sum, point) => sum + point.longitude, 0) / points.length
    };
  }, [props]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "OpenStreetMap contributors"
          }
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm"
          }
        ]
      },
      center: [center.lon, center.lat],
      zoom: props.variant === "areas" ? 9.7 : 11,
      attributionControl: false
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [center.lat, center.lon, props.variant]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    let polygonClickHandler: ((event: maplibregl.MapLayerMouseEvent) => void) | null = null;
    let polygonEnterHandler: (() => void) | null = null;
    let polygonLeaveHandler: (() => void) | null = null;

    const updateOverlays = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      removeLayerIfPresent(map, "selected-area-line");
      removeLayerIfPresent(map, "area-polygons-line");
      removeLayerIfPresent(map, "area-polygons-fill");
      removeLayerIfPresent(map, "radius-catchment-line");
      removeLayerIfPresent(map, "radius-catchment-fill");
      removeSourceIfPresent(map, "area-polygons");
      removeSourceIfPresent(map, "radius-catchment");

      map.easeTo({ center: [center.lon, center.lat], duration: 500 });

      if (props.variant === "areas") {
        if (props.polygons && props.polygons.features.length > 0) {
          map.addSource("area-polygons", {
            type: "geojson",
            data: props.polygons
          });
          map.addLayer({
            id: "area-polygons-fill",
            type: "fill",
            source: "area-polygons",
            paint: {
              "fill-color": [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "style_score"], 0],
                20,
                "#bbf7d0",
                40,
                "#fde68a",
                60,
                "#fb923c",
                80,
                "#dc2626"
              ],
              "fill-opacity": 0.48
            }
          });
          map.addLayer({
            id: "area-polygons-line",
            type: "line",
            source: "area-polygons",
            paint: {
              "line-color": "#334155",
              "line-opacity": 0.55,
              "line-width": 1.2
            }
          });
          map.addLayer({
            id: "selected-area-line",
            type: "line",
            source: "area-polygons",
            filter: ["==", ["get", "area_id"], props.selectedId],
            paint: {
              "line-color": "#0f172a",
              "line-width": 4
            }
          });

          polygonClickHandler = (event: maplibregl.MapLayerMouseEvent) => {
            const feature = event.features?.[0];
            const areaId = feature?.properties?.area_id;
            if (typeof areaId === "string") {
              props.onSelect(areaId);
            }
          };
          polygonEnterHandler = () => {
            map.getCanvas().style.cursor = "pointer";
          };
          polygonLeaveHandler = () => {
            map.getCanvas().style.cursor = "";
          };
          map.on("click", "area-polygons-fill", polygonClickHandler);
          map.on("mouseenter", "area-polygons-fill", polygonEnterHandler);
          map.on("mouseleave", "area-polygons-fill", polygonLeaveHandler);
        }

        for (const point of props.points) {
          const selected = point.area_id === props.selectedId;
          const size = Math.max(18, Math.min(38, 14 + point.gap_score / 2.5));
          const element = createMarkerElement(
            `${point.area_name}, gap ${point.gap_score.toFixed(1)}`,
            markerColor(point.gap_score, selected),
            size,
            selected
          );
          element.addEventListener("click", () => props.onSelect(point.area_id));
          const popup = new maplibregl.Popup({ offset: 16 }).setHTML(
            `<strong>${point.area_name}</strong><br/>Gap score ${point.gap_score.toFixed(1)}<br/>${point.priority_flag}`
          );
          markersRef.current.push(new maplibregl.Marker({ element }).setLngLat([point.longitude, point.latitude]).setPopup(popup).addTo(map));
        }
      } else {
        map.addSource("radius-catchment", {
          type: "geojson",
          data: createCircleFeature(props.area.longitude, props.area.latitude, props.radiusKm)
        });
        map.addLayer({
          id: "radius-catchment-fill",
          type: "fill",
          source: "radius-catchment",
          paint: {
            "fill-color": "#0e7490",
            "fill-opacity": 0.12
          }
        });
        map.addLayer({
          id: "radius-catchment-line",
          type: "line",
          source: "radius-catchment",
          paint: {
            "line-color": "#0e7490",
            "line-width": 2,
            "line-dasharray": [2, 2]
          }
        });

        const areaElement = createMarkerElement(`Client area: ${props.area.area_name}`, "#2563eb", 28, true);
        areaElement.classList.add("area-anchor");
        markersRef.current.push(
          new maplibregl.Marker({ element: areaElement })
            .setLngLat([props.area.longitude, props.area.latitude])
            .setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(`<strong>${props.area.area_name}</strong><br/>Client area`))
            .addTo(map)
        );

        for (const point of props.points) {
          const selected = point.service_id === props.selectedId;
          const distance = point.distance_km ?? 0;
          const element = createMarkerElement(
            `${point.service_name}, ${distance.toFixed(1)} km`,
            markerColor(80 - distance * 8, selected),
            selected ? 28 : 20,
            selected
          );
          element.addEventListener("click", () => props.onSelect(point.service_id));
          const popup = new maplibregl.Popup({ offset: 16 }).setHTML(
            `<strong>${point.service_name}</strong><br/>${point.service_category}<br/>${distance.toFixed(1)} km`
          );
          markersRef.current.push(new maplibregl.Marker({ element }).setLngLat([point.longitude, point.latitude]).setPopup(popup).addTo(map));
        }
      }
    };

    if (map.isStyleLoaded()) {
      updateOverlays();
    } else {
      map.once("load", updateOverlays);
    }

    return () => {
      if (polygonClickHandler) {
        map.off("click", "area-polygons-fill", polygonClickHandler);
      }
      if (polygonEnterHandler) {
        map.off("mouseenter", "area-polygons-fill", polygonEnterHandler);
      }
      if (polygonLeaveHandler) {
        map.off("mouseleave", "area-polygons-fill", polygonLeaveHandler);
      }
    };
  }, [center.lat, center.lon, props]);

  return <div ref={containerRef} className="map-canvas" />;
}
