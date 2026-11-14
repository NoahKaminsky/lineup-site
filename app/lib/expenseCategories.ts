// Safe to import in the browser (earnings.ts is server only).
export const EXPENSE_CATEGORIES = {
  supplies: "Supplies",
  rent: "Rent",
  tools: "Tools and equipment",
  advertising: "Advertising",
  insurance: "Insurance",
  licences: "Licences and dues",
  phone: "Phone and internet",
  vehicle: "Vehicle",
  education: "Training and education",
  other: "Other",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;
