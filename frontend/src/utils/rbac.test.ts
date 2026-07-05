import { describe, expect, it } from "vitest";
import {
  canDeleteDocument,
  canManageDocuments,
  canRecategorize,
  canUpload,
  canViewAdminUsage,
  canViewAudit,
  ROLE_CATEGORIES,
} from "./rbac";

describe("ROLE_CATEGORIES", () => {
  it("gives admin all 5 categories", () => {
    expect(ROLE_CATEGORIES.admin).toEqual(["general", "finance", "hr", "legal", "engineering"]);
  });

  it("gives analyst general + finance only", () => {
    expect(ROLE_CATEGORIES.analyst).toEqual(["general", "finance"]);
  });

  it("gives viewer general only", () => {
    expect(ROLE_CATEGORIES.viewer).toEqual(["general"]);
  });
});

describe("canUpload", () => {
  it("allows admin and analyst", () => {
    expect(canUpload("admin")).toBe(true);
    expect(canUpload("analyst")).toBe(true);
  });

  it("denies viewer", () => {
    expect(canUpload("viewer")).toBe(false);
  });
});

describe("canRecategorize", () => {
  it("allows only admin", () => {
    expect(canRecategorize("admin")).toBe(true);
    expect(canRecategorize("analyst")).toBe(false);
    expect(canRecategorize("viewer")).toBe(false);
  });
});

describe("canManageDocuments", () => {
  it("allows admin and analyst, denies viewer", () => {
    expect(canManageDocuments("admin")).toBe(true);
    expect(canManageDocuments("analyst")).toBe(true);
    expect(canManageDocuments("viewer")).toBe(false);
  });
});

describe("canDeleteDocument", () => {
  it("lets admin delete any document", () => {
    expect(canDeleteDocument("admin", "user-admin-001", "user-analyst-001")).toBe(true);
  });

  it("lets analyst delete only their own upload", () => {
    expect(canDeleteDocument("analyst", "user-analyst-001", "user-analyst-001")).toBe(true);
    expect(canDeleteDocument("analyst", "user-analyst-001", "user-admin-001")).toBe(false);
  });

  it("never lets viewer delete", () => {
    expect(canDeleteDocument("viewer", "user-viewer-001", "user-viewer-001")).toBe(false);
  });
});

describe("canViewAudit / canViewAdminUsage", () => {
  it("are admin-only", () => {
    for (const role of ["admin", "analyst", "viewer"] as const) {
      expect(canViewAudit(role)).toBe(role === "admin");
      expect(canViewAdminUsage(role)).toBe(role === "admin");
    }
  });
});
