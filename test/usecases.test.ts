import { describe, it, expect } from "vitest";

// @ts-expect-error -- plain .mjs script without type declarations
import { buildUsecasesMarkdown, EXTRA_ASSIGNMENTS } from "../scripts/build-usecases.mjs";

// A miniature usecases.yaml that exercises every shape the real file has:
// a use case with refs, a commented-out ref, an orphan data entry not referenced
// by any use case, and resources of different types.
const SAMPLE = `
description: "Why use cases matter intro."
usecases:
  infraascode:
    title: Infrastructure as Code
    description: Provision topics from contracts.
    inproduction:
    - $ref: '#/data/raiffeisen'
    # - $ref: '#/data/schwarz'
  docs:
    title: Developer Portal and Discoverability
    description: Share which events exist.
    inproduction:
    - $ref: '#/data/zora'
data:
  raiffeisen:
    name: Raiffeisen Bank
    description: GitOps pipeline on AsyncAPI definitions.
    resources:
      - type: Video
        url: https://example.com/raiffeisen
  zora:
    name: Zora Robotics
    description: Documenting public MQTT APIs.
    resources:
      - type: Video
        url: https://example.com/zora
  morgan:
    name: Morgan Stanley
    description: Sharing Websocket APIs.
    resources:
      - type: Slides
        url: https://example.com/morgan
  siemens:
    name: Siemens AG
    description: Documenting ROS2 interfaces.
    resources:
      - type: Code
        url: https://example.com/siemens
  pagopa:
    name: PagoPA
    description: Springwolf-generated docs.
    resources:
      - type: Code
        url: https://example.com/pagopa
`;

describe("build-usecases", () => {
  const md = buildUsecasesMarkdown(SAMPLE);

  it("includes the top-level description as intro", () => {
    expect(md).toContain("Why use cases matter intro.");
  });

  it("dereferences refs into the company name, description and links", () => {
    expect(md).toContain("Raiffeisen Bank");
    expect(md).toContain("GitOps pipeline on AsyncAPI definitions.");
    expect(md).toContain("https://example.com/raiffeisen");
    expect(md).toContain("Infrastructure as Code");
  });

  it("places orphan entries under their assigned use cases", () => {
    // Morgan Stanley -> infraascode, Siemens + PagoPA -> docs
    const infra = md.slice(md.indexOf("Infrastructure as Code"), md.indexOf("Developer Portal"));
    const docs = md.slice(md.indexOf("Developer Portal"));
    expect(infra).toContain("Morgan Stanley");
    expect(docs).toContain("Siemens AG");
    expect(docs).toContain("PagoPA");
  });

  it("does not invent or include commented-out entries (Schwarz)", () => {
    expect(md).not.toContain("Schwarz");
  });

  it("never lists the same company twice within one use case (dedupe)", () => {
    // If an orphan is ALSO referenced upstream, it must appear once, not twice.
    const merged = buildUsecasesMarkdown(SAMPLE, { docs: ["zora", "siemens", "pagopa"] });
    const docs = merged.slice(merged.indexOf("Developer Portal"));
    const zoraCount = docs.split("Zora Robotics").length - 1;
    expect(zoraCount).toBe(1);
  });

  it("throws when a ref points at a missing data key", () => {
    const broken = SAMPLE.replace("#/data/zora", "#/data/doesnotexist");
    expect(() => buildUsecasesMarkdown(broken)).toThrow(/doesnotexist/);
  });

  it("exposes the real orphan assignments used by the generator", () => {
    expect(EXTRA_ASSIGNMENTS).toMatchObject({
      infraascode: expect.arrayContaining(["morgan"]),
      docs: expect.arrayContaining(["siemens", "pagopa"]),
    });
  });
});
