import { describe, expect, it } from "vitest";
import { plainStripeRequirement, plainStripeRequirements } from "@/app/lib/stripeRequirements";

describe("Stripe requirements in plain English", () => {
  it("says what Stripe wants the way a pro would", () => {
    expect(plainStripeRequirement("individual.verification.proof_of_liveness")).toBe("a quick selfie to confirm it's you");
    expect(plainStripeRequirement("external_account")).toBe("your bank account");
    expect(plainStripeRequirement("individual.verification.document")).toBe("a photo of your ID");
    expect(plainStripeRequirement("individual.id_number")).toBe("your Social Insurance Number");
    expect(plainStripeRequirement("tos_acceptance.date")).toBe("accepting Stripe's terms");
  });
  it("lists each thing once and tidies unknown fields", () => {
    expect(plainStripeRequirements(["individual.dob.day", "individual.dob.month", "individual.dob.year", "external_account"])).toEqual(["your date of birth", "your bank account"]);
    expect(plainStripeRequirement("company.tax_id")).toBe("company tax id");
  });
});
