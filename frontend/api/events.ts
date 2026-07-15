export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  // Placeholder for anonymous workflow telemetry. Keep this endpoint free of
  // client identifiers, case notes, and raw personal data until a durable event
  // store and retention policy are approved.
  res.status(202).json({ accepted: true });
}
