import { haversineKm } from "../lib/supabaseData.js";

// Sorted by real distance to the selected service (not to the distribution
// point, and not just "first N in the array") so "Also nearby" is accurate.
export function getFlyerNearbyServices(services, selectedService, limit = 2) {
  return services
    .filter((service) => service.id !== selectedService.id && service.lat != null && service.lng != null)
    .map((service) => ({
      ...service,
      distanceFromSelectedKm: haversineKm(selectedService.lat, selectedService.lng, service.lat, service.lng),
    }))
    .sort((a, b) => a.distanceFromSelectedKm - b.distanceFromSelectedKm)
    .slice(0, limit);
}

export function getFlyerFileName(service) {
  const serviceName = service.name.trim().replace(/\s+/g, "-").toLowerCase();
  return `flyer-${serviceName}.pdf`;
}
