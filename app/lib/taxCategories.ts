// Where each kind of income and expense goes on a CRA T2125-style statement
// (Statement of Business or Professional Activities).
//
// ACCOUNTANT TO CONFIRM: these line numbers are LineUp's best reading of the
// T2125 for a self-employed beauty or grooming pro. They are a starting point
// for the pro and their accountant, not tax advice. Change them here only;
// screens, the PDF and the CSV all read this file.
//
// Safe to import in the browser.

export const EXPENSE_CATEGORIES = {
  supplies: "Supplies and products",
  rent: "Rent",
  advertising: "Advertising",
  licences: "Licences and memberships",
  professional_fees: "Professional fees",
  phone: "Phone and internet",
  vehicle: "Vehicle",
  insurance: "Insurance",
  tools: "Tools and equipment",
  education: "Training and education",
  other: "Other",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

// Expenses LineUp already knows about, added automatically.
export const AUTO_EXPENSES = {
  lineup_commission: "LineUp commission",
  card_fees: "Card processing fees",
  lineup_plan: "LineUp plan (Spotlight included)",
  boosts: "Boosts",
  booth_rent_paid: "Booth rent paid",
  shop_commission: "Shop commission withheld",
} as const;
export type AutoExpense = keyof typeof AUTO_EXPENSES;

export const INCOME_LINES = {
  services: "Service sales",
  tips: "Tips",
  gift_cards: "Gift card sales",
  memberships: "Memberships",
  booth_rent_received: "Booth rent received",
  products: "Product sales",
  no_show_fees: "No-show fees",
} as const;
export type IncomeLine = keyof typeof INCOME_LINES;

// T2125 lines. Accountant to confirm.
export const T2125_LINE: Record<IncomeLine | ExpenseCategory | AutoExpense, string> = {
  // Part 3C, gross business income
  services: "8000",
  no_show_fees: "8000",
  products: "8000",
  tips: "8230",
  gift_cards: "8000",
  memberships: "8000",
  booth_rent_received: "8230",
  // Part 4, expenses
  supplies: "8811",
  rent: "8910",
  advertising: "8521",
  licences: "8760",
  professional_fees: "8860",
  phone: "9220",
  vehicle: "9281",
  insurance: "8690",
  tools: "9936",
  education: "9270",
  other: "9270",
  lineup_commission: "8871",
  card_fees: "8710",
  lineup_plan: "8871",
  boosts: "8521",
  booth_rent_paid: "8910",
  shop_commission: "8871",
};

export const DISCLAIMER = "This is a record of your LineUp earnings to help with your taxes. It isn't a tax slip or tax advice.";

// GST/HST small supplier limit (taxable sales over four consecutive calendar quarters).
export const SMALL_SUPPLIER_LIMIT_CENTS = 3_000_000;
export const CRA_GST_URL = "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/gst-hst-registration.html";

export type BusinessType = "sole_proprietor" | "partnership" | "corporation";
export const BUSINESS_TYPES: Record<BusinessType, string> = {
  sole_proprietor: "Sole proprietor",
  partnership: "Partnership",
  corporation: "Corporation",
};
