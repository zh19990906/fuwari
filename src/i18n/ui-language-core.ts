export const UI_LANGUAGE_STORAGE_KEY = "fuwari-ui-language";
export const DEFAULT_UI_LANGUAGE = "zh_CN" as const;

export type UiLanguage = typeof DEFAULT_UI_LANGUAGE | "en";

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export type TranslationValues = Readonly<object>;
export type UiTranslationTable = Record<UiLanguage, TranslationValues>;

export interface LocalizableElement {
	dataset: Record<string, string | undefined>;
	textContent: string | null;
	setAttribute(name: string, value: string): void;
}

export interface LocalizableRoot {
	querySelectorAll(selector: string): Iterable<LocalizableElement>;
}

export function normalizeUiLanguage(value: unknown): UiLanguage {
	return value === "en" || value === "zh_CN" ? value : DEFAULT_UI_LANGUAGE;
}

export function readStoredUiLanguage(storage?: StorageLike | null): UiLanguage {
	if (!storage) return DEFAULT_UI_LANGUAGE;
	try {
		return normalizeUiLanguage(storage.getItem(UI_LANGUAGE_STORAGE_KEY));
	} catch {
		return DEFAULT_UI_LANGUAGE;
	}
}

export function writeStoredUiLanguage(
	storage: StorageLike | null | undefined,
	language: UiLanguage,
): boolean {
	if (!storage) return false;
	try {
		storage.setItem(UI_LANGUAGE_STORAGE_KEY, language);
		return true;
	} catch {
		return false;
	}
}

export function translateKey(
	key: string | undefined,
	language: UiLanguage,
	translations: UiTranslationTable,
): string | undefined {
	if (!key) return undefined;
	const selected = translations[language] as Record<string, string | undefined>;
	const fallback = translations.zh_CN as Record<string, string | undefined>;
	return selected[key] ?? fallback[key] ?? key;
}

function updateTextNodes(
	root: LocalizableRoot,
	language: UiLanguage,
	translations: UiTranslationTable,
): void {
	for (const element of root.querySelectorAll("[data-i18n-key]")) {
		const value = translateKey(element.dataset.i18nKey, language, translations);
		if (value !== undefined && element.textContent !== value) {
			element.textContent = value;
		}
	}
}

function updateAttributeNodes(
	root: LocalizableRoot,
	language: UiLanguage,
	translations: UiTranslationTable,
): void {
	const attributes = [
		["[data-i18n-aria-label]", "i18nAriaLabel", "aria-label"],
		["[data-i18n-placeholder]", "i18nPlaceholder", "placeholder"],
		["[data-i18n-title]", "i18nTitle", "title"],
	] as const;

	for (const [selector, datasetKey, attributeName] of attributes) {
		for (const element of root.querySelectorAll(selector)) {
			const value = translateKey(
				element.dataset[datasetKey],
				language,
				translations,
			);
			if (value !== undefined) {
				element.setAttribute(attributeName, value);
			}
		}
	}
}

function updateLanguageOptions(root: LocalizableRoot, language: UiLanguage): void {
	for (const element of root.querySelectorAll("[data-ui-language-option]")) {
		const active = element.dataset.uiLanguageOption === language;
		const value = String(active);
		element.dataset.active = value;
		element.setAttribute("aria-pressed", value);
	}
}

export function applyTranslationToRoot(
	root: LocalizableRoot,
	language: UiLanguage,
	translations: UiTranslationTable,
): void {
	updateTextNodes(root, language, translations);
	updateAttributeNodes(root, language, translations);
	updateLanguageOptions(root, language);
}
