import { haversineKm } from "../lib/supabaseData.js";

function hasCoordinates(service) {
  return service?.lat != null && service?.lng != null;
}

function getAudienceTags(service) {
  return [
    service.gender && service.gender !== "All" ? service.gender : null,
    ...(service.ageGroups || []),
    ...(service.group || []),
  ].filter(Boolean);
}

// A small domain object keeps all flyer-specific decisions in one place.
// The preview and PDF exporter consume the same instance, so no service or
// location is copied into a flyer-only, potentially stale data structure.
export class FlyerViewModel {
  #candidateServices;

  constructor({ service, location, candidateServices = [], language = "EN", updatedLabel = "" }) {
    if (!service?.id) throw new Error("A selected service is required to create a flyer.");
    if (!location?.id) throw new Error("A distribution location is required to create a flyer.");

    this.service = service;
    this.location = location;
    this.language = language;
    this.updatedLabel = updatedLabel;
    this.#candidateServices = candidateServices;
  }

  static fromSelection(selection) {
    return new FlyerViewModel(selection);
  }

  get nearbyServices() {
    return this.#candidateServices
      .filter((candidate) => candidate.id !== this.service.id && hasCoordinates(candidate))
      .map((candidate) => ({
        ...candidate,
        distanceFromSelectedKm: hasCoordinates(this.service)
          ? haversineKm(this.service.lat, this.service.lng, candidate.lat, candidate.lng)
          : null,
      }))
      .sort((left, right) => (left.distanceFromSelectedKm ?? Infinity) - (right.distanceFromSelectedKm ?? Infinity))
      .slice(0, 2);
  }

  get audienceTags() {
    return getAudienceTags(this.service);
  }

  get servicesOffered() {
    return (this.service.tags || []).slice(0, 4);
  }

  get destinations() {
    return [this.service, ...this.nearbyServices];
  }

  get fileName() {
    return getFlyerFileName(this.service);
  }
}

export function getFlyerFileName(service) {
  const serviceName = String(service?.name || "community-service")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `flyer-${serviceName}.pdf`;
}
