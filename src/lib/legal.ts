// Who operates the service and how to reach them. Set these in the environment before launch.
export const LEGAL = {
  operator: process.env.LEGAL_OPERATOR_NAME || "FinSync",
  contactEmail: process.env.SUPPORT_EMAIL || null,
  effective: "5 October 2026",
};
