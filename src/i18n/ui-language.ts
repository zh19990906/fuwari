import { en } from "./languages/en";
import { zh_CN } from "./languages/zh_CN";
import {
	applyTranslationToRoot,
	DEFAULT_UI_LANGUAGE,
	type LocalizableRoot,
	normalizeUiLanguage,
	readStoredUiLanguage,
	translateKey,
	type UiLanguage,
	type UiTranslationTable,
	writeStoredUiLanguage,
} from "./ui-language-core";
import { uiLanguageLabels } from "./ui-language-labels";

const translations: UiTranslationTable = {
	en: { ...en, ...uiLanguageLabels.en },
	zh_CN: { ...zh_CN, ...uiLanguageLabels.zh_CN },
};
const HTML_LANG: Record<UiLanguage, string> = {
	zh_CN: "zh-CN",
	en: "en",
};

let applyQueued = false;

function getStorage(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function getCurrentLanguage(): UiLanguage {
	return normalizeUiLanguage(
		document.documentElement.dataset.uiLanguage ??
			readStoredUiLanguage(getStorage()),
	);
}

function updateDocumentTitle(language: UiLanguage): void {
	const marker = document.querySelector<HTMLElement>(
		"[data-ui-document-title-key]",
	);
	const key =
		marker?.dataset.uiDocumentTitleKey ??
		document.documentElement.dataset.uiTitleKey;
	if (!key) return;

	const translatedTitle = translateKey(key, language, translations);
	if (!translatedTitle) return;

	const suffix =
		marker?.dataset.uiDocumentTitleSuffix ??
		document.documentElement.dataset.uiTitleSuffix;
	document.title = suffix ? `${translatedTitle} - ${suffix}` : translatedTitle;
}

function applyUiLanguage(language: UiLanguage): void {
	const html = document.documentElement;
	html.dataset.uiLanguage = language;
	html.lang = HTML_LANG[language];
	applyTranslationToRoot(
		document as unknown as LocalizableRoot,
		language,
		translations,
	);
	updateDocumentTitle(language);
	html.classList.remove("ui-language-pending");
}

function scheduleApply(): void {
	if (applyQueued) return;
	applyQueued = true;
	queueMicrotask(() => {
		applyQueued = false;
		applyUiLanguage(getCurrentLanguage());
	});
}

export function selectUiLanguage(value: unknown): UiLanguage {
	const language = normalizeUiLanguage(value);
	writeStoredUiLanguage(getStorage(), language);
	applyUiLanguage(language);
	document.dispatchEvent(
		new CustomEvent("fuwari:language-change", {
			detail: { language },
		}),
	);
	return language;
}

export function initializeUiLanguage(): void {
	const html = document.documentElement;
	if (html.dataset.uiLanguageRuntime === "ready") {
		applyUiLanguage(getCurrentLanguage());
		return;
	}
	html.dataset.uiLanguageRuntime = "ready";

	document.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const option = target.closest<HTMLElement>("[data-ui-language-option]");
		if (!option) return;
		selectUiLanguage(option.dataset.uiLanguageOption);
	});

	document.addEventListener("fuwari:language-change", scheduleApply);
	document.addEventListener("astro:page-load", scheduleApply);
	document.addEventListener("swup:contentReplaced", scheduleApply);
	document.addEventListener("swup:pageView", scheduleApply);

	if (document.body) {
		const observer = new MutationObserver(scheduleApply);
		observer.observe(document.body, { childList: true, subtree: true });
	}

	applyUiLanguage(
		normalizeUiLanguage(
			html.dataset.uiLanguage ??
				readStoredUiLanguage(getStorage()) ??
				DEFAULT_UI_LANGUAGE,
		),
	);
}
