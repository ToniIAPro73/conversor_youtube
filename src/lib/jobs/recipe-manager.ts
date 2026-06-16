/**
 * Recipe manager — versioned automation recipes.
 *
 * A recipe is a named sequence of operations applied to every file that enters
 * a watched folder or is selected by the user. Recipes are stored as JSON in the
 * application data directory and versioned through a schemaVersion field so future
 * migrations can be applied automatically.
 *
 * Design rules:
 * - No in-memory global state beyond the singleton instance
 * - Recipes are validated against OperationDefinition catalog before saving
 * - Each recipe gets a stable id (slug) derived from its name at creation time
 * - Recipes do NOT store job history — the JobManager owns that
 */

import fs from "fs";
import path from "path";
import type { RecipeDefinition } from "../domain/operations";
import { OPERATION_CATALOG } from "../domain/operations";

const SCHEMA_VERSION = "1" as const;
const RECIPE_FILE = "recipes.json";

type RecipesFile = { schemaVersion: typeof SCHEMA_VERSION; recipes: RecipeDefinition[] };

function recipesFilePath(): string {
  const dataDir = path.resolve(process.cwd(), "data");
  return path.join(dataDir, RECIPE_FILE);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readStore(): RecipeDefinition[] {
  const file = recipesFilePath();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as RecipesFile;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return [];
    return parsed.recipes ?? [];
  } catch {
    return [];
  }
}

function writeStore(recipes: RecipeDefinition[]): void {
  const file = recipesFilePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const store: RecipesFile = { schemaVersion: SCHEMA_VERSION, recipes };
  fs.writeFileSync(file, JSON.stringify(store, null, 2), "utf-8");
}

export class RecipeValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = "RecipeValidationError";
  }
}

function validate(recipe: Partial<RecipeDefinition>): void {
  if (!recipe.name?.trim()) {
    throw new RecipeValidationError("name", "El nombre de la receta es obligatorio");
  }
  if (!recipe.operations?.length) {
    throw new RecipeValidationError("operations", "La receta debe tener al menos una operación");
  }
  const knownIds = new Set(OPERATION_CATALOG.map((o) => o.id));
  for (const op of recipe.operations) {
    if (!knownIds.has(op.operationId)) {
      throw new RecipeValidationError("operations", `Operación desconocida: ${op.operationId}`);
    }
  }
  if (recipe.concurrency !== undefined && (recipe.concurrency < 1 || recipe.concurrency > 8)) {
    throw new RecipeValidationError("concurrency", "La concurrencia debe estar entre 1 y 8");
  }
  if (recipe.retryCount !== undefined && (recipe.retryCount < 0 || recipe.retryCount > 5)) {
    throw new RecipeValidationError("retryCount", "El número de reintentos debe estar entre 0 y 5");
  }
}

function applyDefaults(recipe: Partial<RecipeDefinition> & Pick<RecipeDefinition, "name">): RecipeDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: recipe.id ?? slugify(recipe.name),
    name: recipe.name,
    description: recipe.description ?? "",
    operations: recipe.operations ?? [],
    inputFilter: recipe.inputFilter ?? {},
    outputNaming: recipe.outputNaming ?? "append-suffix",
    outputSuffix: recipe.outputSuffix ?? "-converted",
    concurrency: recipe.concurrency ?? 1,
    onError: recipe.onError ?? "skip",
    retryCount: recipe.retryCount ?? 1,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export class RecipeManager {
  /** Returns all stored recipes */
  list(): RecipeDefinition[] {
    return readStore();
  }

  /** Finds a recipe by id */
  get(id: string): RecipeDefinition | undefined {
    return readStore().find((r) => r.id === id);
  }

  /**
   * Creates a new recipe. Throws RecipeValidationError on invalid input.
   * Throws if a recipe with the same id already exists.
   */
  create(draft: Partial<RecipeDefinition> & Pick<RecipeDefinition, "name">): RecipeDefinition {
    validate(draft);
    const recipe = applyDefaults(draft);
    const store = readStore();
    if (store.some((r) => r.id === recipe.id)) {
      throw new RecipeValidationError("id", `Ya existe una receta con id '${recipe.id}'. Usa un nombre diferente.`);
    }
    store.push(recipe);
    writeStore(store);
    return recipe;
  }

  /**
   * Updates an existing recipe. Partial patch — only provided fields are overwritten.
   * Throws RecipeValidationError if the result would be invalid.
   */
  update(id: string, patch: Partial<RecipeDefinition>): RecipeDefinition {
    const store = readStore();
    const idx = store.findIndex((r) => r.id === id);
    if (idx === -1) throw new RecipeValidationError("id", `Receta no encontrada: ${id}`);
    const merged: RecipeDefinition = { ...store[idx], ...patch, id };
    validate(merged);
    store[idx] = merged;
    writeStore(store);
    return merged;
  }

  /** Deletes a recipe by id. Returns true if deleted, false if not found. */
  delete(id: string): boolean {
    const store = readStore();
    const filtered = store.filter((r) => r.id !== id);
    if (filtered.length === store.length) return false;
    writeStore(filtered);
    return true;
  }
}

export const recipeManager = new RecipeManager();
