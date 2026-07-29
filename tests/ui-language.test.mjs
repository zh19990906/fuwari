import assert from "node:assert/strict";
import test from "node:test";
import {
	applyTranslationToRoot,
	DEFAULT_UI_LANGUAGE,
	normalizeUiLanguage,
	readStoredUiLanguage,
	translateKey,
	UI_LANGUAGE_STORAGE_KEY,
	writeStoredUiLanguage,
} from "../.test-dist/src/i18n/ui-language-core.js";

class FakeElement {
	constructor(dataset = {}) {
		this.dataset = { ...dataset };
		this.textContent = "initial";
		this.attributes = {};
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}
}

class FakeRoot {
	constructor(selectors) {
		this.selectors = selectors;
	}

	querySelectorAll(selector) {
		return this.selectors[selector] ?? [];
	}
}

const translations = {
	zh_CN: {
		home: "主页",
		search: "搜索",
		"ui.switchToEnglish": "切换为英文",
	},
	en: {
		home: "Home",
		search: "Search",
		"ui.switchToEnglish": "Switch to English",
	},
};

test("normalizes only supported UI languages", () => {
	assert.equal(normalizeUiLanguage("zh_CN"), "zh_CN");
	assert.equal(normalizeUiLanguage("en"), "en");
	assert.equal(normalizeUiLanguage("ja"), DEFAULT_UI_LANGUAGE);
	assert.equal(normalizeUiLanguage(null), DEFAULT_UI_LANGUAGE);
});

test("reads, writes, and safely falls back when storage is unavailable", () => {
	const values = new Map();
	const storage = {
		getItem(key) {
			return values.get(key) ?? null;
		},
		setItem(key, value) {
			values.set(key, value);
		},
	};

	assert.equal(readStoredUiLanguage(storage), "zh_CN");
	assert.equal(writeStoredUiLanguage(storage, "en"), true);
	assert.equal(values.get(UI_LANGUAGE_STORAGE_KEY), "en");
	assert.equal(readStoredUiLanguage(storage), "en");

	const blockedStorage = {
		getItem() {
			throw new Error("blocked");
		},
		setItem() {
			throw new Error("blocked");
		},
	};
	assert.equal(readStoredUiLanguage(blockedStorage), "zh_CN");
	assert.equal(writeStoredUiLanguage(blockedStorage, "en"), false);
});

test("translates text, attributes, and language option state", () => {
	const text = new FakeElement({ i18nKey: "home" });
	const aria = new FakeElement({ i18nAriaLabel: "ui.switchToEnglish" });
	const placeholder = new FakeElement({ i18nPlaceholder: "search" });
	const title = new FakeElement({ i18nTitle: "home" });
	const chineseOption = new FakeElement({ uiLanguageOption: "zh_CN" });
	const englishOption = new FakeElement({ uiLanguageOption: "en" });
	const root = new FakeRoot({
		"[data-i18n-key]": [text],
		"[data-i18n-aria-label]": [aria],
		"[data-i18n-placeholder]": [placeholder],
		"[data-i18n-title]": [title],
		"[data-ui-language-option]": [chineseOption, englishOption],
	});

	applyTranslationToRoot(root, "en", translations);

	assert.equal(text.textContent, "Home");
	assert.equal(aria.attributes["aria-label"], "Switch to English");
	assert.equal(placeholder.attributes.placeholder, "Search");
	assert.equal(title.attributes.title, "Home");
	assert.equal(chineseOption.attributes["aria-pressed"], "false");
	assert.equal(englishOption.attributes["aria-pressed"], "true");
	assert.equal(chineseOption.dataset.active, "false");
	assert.equal(englishOption.dataset.active, "true");
});

test("falls back to Chinese and finally the key for missing translations", () => {
	assert.equal(translateKey("home", "en", translations), "Home");
	assert.equal(translateKey("search", "en", { ...translations, en: {} }), "搜索");
	assert.equal(translateKey("unknown", "en", translations), "unknown");
});
