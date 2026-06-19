import { describe, expect, it } from "vitest";

import {
  extractPropertyDossierEntities,
  processPropertyDossier,
  type PropertyDossierFile,
} from "../../src/lib/engines/mineru/property-dossier";

const files: PropertyDossierFile[] = [
  {
    name: "dossier.pdf",
    kind: "pdf",
    bytes: "raw ocr ".repeat(200),
  },
];

describe("MinerU property dossier processor", () => {
  it("extracts structured property entities from MinerU markdown", async () => {
    const result = await processPropertyDossier(files, {
      rawOcrText: "raw ocr ".repeat(400),
      mineruAdapter: {
        async parse() {
          return {
            markdown: [
              "Direccion: Carrer de la Mar 12, Palma",
              "Referencia catastral: 0704001DD7800S0001AB",
              "Superficie: 145 m2",
              "Precio: EUR 1250000",
              "Clasificacion: vivienda residencial",
            ].join("\n"),
            metadata: { backend: "pipeline" },
          };
        },
      },
      tesseractAdapter: {
        async extract() {
          throw new Error("fallback should not run");
        },
      },
    });

    expect(result.extractionEngine).toBe("mineru-popo");
    expect(result.precisionLevel).toBe("full");
    expect(result.entities.address).toBe("Carrer de la Mar 12, Palma");
    expect(result.entities.cadastralReference).toBe("0704001DD7800S0001AB");
    expect(result.entities.surfaceM2).toBe(145);
    expect(result.entities.priceEur).toBe(1250000);
    expect(result.entities.classification).toBe("residential");
    expect(result.tokenReductionRatio).toBeGreaterThanOrEqual(0.7);
  });

  it("falls back to Tesseract with reduced precision when MinerU fails", async () => {
    const result = await processPropertyDossier(files, {
      mineruAdapter: {
        async parse() {
          throw new Error("mineru unavailable");
        },
      },
      tesseractAdapter: {
        async extract() {
          return {
            text: "Direccion: Solar 7, Inca\nSuperficie: 900 m2\nPrecio: 350000 EUR\nTipo: solar",
          };
        },
      },
    });

    expect(result.extractionEngine).toBe("tesseract");
    expect(result.precisionLevel).toBe("reduced");
    expect(result.warnings).toContain("MINERU_FAILED_TESSERACT_FALLBACK_USED");
    expect(result.entities.classification).toBe("land");
  });

  it("flags MinerU output that does not reach the 70 percent token reduction target", async () => {
    const result = await processPropertyDossier(files, {
      rawOcrText: "short raw text",
      mineruAdapter: {
        async parse() {
          return { markdown: "long structured text ".repeat(20) };
        },
      },
      tesseractAdapter: {
        async extract() {
          throw new Error("fallback should not run");
        },
      },
    });

    expect(result.warnings).toContain("MINERU_TOKEN_REDUCTION_BELOW_TARGET");
  });
});

describe("property dossier entity extraction", () => {
  it("returns unknown classification when no property type signal exists", () => {
    const entities = extractPropertyDossierEntities("Direccion: Test 1");
    expect(entities.classification).toBe("unknown");
  });
});
