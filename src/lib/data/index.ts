/**
 * Fábrica do repositório: escolhe a implementação conforme a config.
 */

import { dataMode } from "@/lib/env";
import type { Repository } from "./repository";
import { MockRepository } from "./mock-repository";
import { SupabaseRepository } from "./supabase-repository";

let cached: Repository | null = null;

export function getRepository(): Repository {
  if (!cached) {
    cached = dataMode() === "supabase" ? new SupabaseRepository() : new MockRepository();
  }
  return cached;
}

export type {
  Repository,
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  ExpenseFilters,
  CreateExpenseInput,
  CreateSettlementInput,
  Space,
  Member,
  CreateSpaceInput,
  AddMemberInput,
  ContactMessage,
} from "./repository";
