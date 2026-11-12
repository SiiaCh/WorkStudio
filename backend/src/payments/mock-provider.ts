import { randomUUID } from "node:crypto";

// Only this provider interprets the simulation instruction. No external service or money is involved.
export function simulatePayment(scenario: "success" | "failure") {
  return {
    providerReference: randomUUID(),
    status: scenario === "success" ? "SUCCEEDED" as const : "FAILED" as const,
  };
}
