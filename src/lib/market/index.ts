import { yahooProvider } from "./yahoo";
import type { CompanyFinancials } from "./types";

export * from "./types";

/**
 * Fonte de dados em uso.
 *
 * Só há uma por agora (Yahoo Finance, sem chave). A indireção existe para que
 * trocar por uma fonte paga — que traria estimativas de analistas e médias de
 * setor — seja mudar esta linha e nada mais.
 */
const provider = yahooProvider;

export function providerName(): string {
  return provider.name;
}

export function fetchCompanyFinancials(symbol: string): Promise<CompanyFinancials> {
  return provider.fetchCompany(symbol);
}
