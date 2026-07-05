/**
 * Dicionários carregados eagermente (bundles pequenos, apenas site público).
 * Markdown das páginas legais entra via `?raw`.
 */
import type { Locale } from "./config";

import ptCommon from "@/locales/pt-BR/common.json";
import ptHome from "@/locales/pt-BR/home.json";
import ptTerms from "@/locales/pt-BR/terms.json";
import ptPrivacy from "@/locales/pt-BR/privacy-policy.json";
import ptPrivacyBody from "@/locales/pt-BR/privacy-policy.md?raw";

import enCommon from "@/locales/en/common.json";
import enHome from "@/locales/en/home.json";
import enTerms from "@/locales/en/terms.json";
import enPrivacy from "@/locales/en/privacy-policy.json";
import enPrivacyBody from "@/locales/en/privacy-policy.md?raw";

export type Namespace = "common" | "home" | "terms" | "privacy-policy";

type Dict = Record<string, unknown>;

const dictionaries: Record<Locale, Record<Namespace, Dict>> = {
  "pt-BR": {
    common: ptCommon as Dict,
    home: ptHome as Dict,
    terms: ptTerms as Dict,
    "privacy-policy": ptPrivacy as Dict,
  },
  en: {
    common: enCommon as Dict,
    home: enHome as Dict,
    terms: enTerms as Dict,
    "privacy-policy": enPrivacy as Dict,
  },
};

const legalBodies: Record<Locale, { "privacy-policy": string }> = {
  "pt-BR": { "privacy-policy": ptPrivacyBody },
  en: { "privacy-policy": enPrivacyBody },
};

export function getDict(locale: Locale, ns: Namespace): Dict {
  return dictionaries[locale][ns] ?? {};
}

export function getLegalBody(locale: Locale, ns: "privacy-policy"): string {
  return legalBodies[locale][ns] ?? "";
}

/** Resolve chave dot-notation dentro de um dicionário. */
export function resolveKey(dict: Dict, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Dict)) {
      return (acc as Dict)[part];
    }
    return undefined;
  }, dict);
}
