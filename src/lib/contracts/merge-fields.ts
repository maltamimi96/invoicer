/** Merge fields available in contract rich-text (plain module — safe for client + server). */
export const CONTRACT_MERGE_FIELDS = [
  "customer_name", "customer_company", "customer_email", "customer_address",
  "business_name", "business_email", "business_phone", "business_address", "date",
] as const;
