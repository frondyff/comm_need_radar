export function getFlyerNearbyServices(services, selectedService, limit = 2) {
  return services.filter((service) => service.id !== selectedService.id).slice(0, limit);
}

export function getFlyerFileName(service) {
  const serviceName = service.name.trim().replace(/\s+/g, "-").toLowerCase();
  return `flyer-${serviceName}.pdf`;
}
