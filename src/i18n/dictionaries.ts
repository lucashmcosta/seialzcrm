/**
 * Dicionários carregados eagermente (bundles pequenos, apenas site público).
 * Markdown das páginas legais entra via `?raw`.
 */
import type { Locale } from "./config";

import ptCommon from "@/locales/pt-BR/common.json";
import ptHome from "@/locales/pt-BR/home.json";
import ptTerms from "@/locales/pt-BR/terms.json";
import ptPrivacy from "@/locales/pt-BR/privacy-policy.json";
import ptDataDeletion from "@/locales/pt-BR/data-deletion.json";
import ptPrivacyBody from "@/locales/pt-BR/privacy-policy.md?raw";
import ptTermsBody from "@/locales/pt-BR/terms-of-service.md?raw";
import ptDataDeletionBody from "@/locales/pt-BR/data-deletion.md?raw";

import enCommon from "@/locales/en/common.json";
import enHome from "@/locales/en/home.json";
import enTerms from "@/locales/en/terms.json";
import enPrivacy from "@/locales/en/privacy-policy.json";
import enDataDeletion from "@/locales/en/data-deletion.json";
import enPrivacyBody from "@/locales/en/privacy-policy.md?raw";
import enTermsBody from "@/locales/en/terms-of-service.md?raw";
import enDataDeletionBody from "@/locales/en/data-deletion.md?raw";

export type Namespace =
  | "common"
  | "home"
  | "terms"
  | "privacy-policy"
  | "data-deletion";

export type LegalBodyKey = "privacy-policy" | "terms-of-service" | "data-deletion";

type Dict = Record<string, unknown>;

const dictionaries: Record<Locale, Record<Namespace, Dict>> = {
  "pt-BR": {
    common: ptCommon as Dict,
    home: ptHome as Dict,
    terms: ptTerms as Dict,
    "privacy-policy": ptPrivacy as Dict,
    "data-deletion": ptDataDeletion as Dict,
  },
  en: {
    common: enCommon as Dict,
    home: enHome as Dict,
    terms: enTerms as Dict,
    "privacy-policy": enPrivacy as Dict,
    "data-deletion": enDataDeletion as Dict,
  },
};

const legalBodies: Record<Locale, Record<LegalBodyKey, string>> = {
  "pt-BR": {
    "privacy-policy": ptPrivacyBody,
    "terms-of-service": ptTermsBody,
    "data-deletion": ptDataDeletionBody,
  },
  en: {
    "privacy-policy": enPrivacyBody,
    "terms-of-service": enTermsBody,
    "data-deletion": enDataDeletionBody,
  },
};

export function getDict(locale: Locale, ns: Namespace): Dict {
  return dictionaries[locale][ns] ?? {};
}

export function getLegalBody(locale: Locale, key: LegalBodyKey): string {
  return legalBodies[locale][key] ?? "";
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
