import type { UiLanguage } from "./ui-language-core";

export const UiLabelKey = {
	language: "ui.language",
	displaySettings: "ui.displaySettings",
	navigationMenu: "ui.navigationMenu",
	searchPanel: "ui.searchPanel",
	resetToDefault: "ui.resetToDefault",
	lightDarkMode: "ui.lightDarkMode",
	switchToChinese: "ui.switchToChinese",
	switchToEnglish: "ui.switchToEnglish",
	docs: "ui.docs",
	documentation: "ui.documentation",
	backToDocs: "ui.backToDocs",
} as const;

export type UiLabelKeyValue = (typeof UiLabelKey)[keyof typeof UiLabelKey];

export const uiLanguageLabels: Record<
	UiLanguage,
	Record<UiLabelKeyValue, string>
> = {
	zh_CN: {
		[UiLabelKey.language]: "页面语言",
		[UiLabelKey.displaySettings]: "显示设置",
		[UiLabelKey.navigationMenu]: "导航菜单",
		[UiLabelKey.searchPanel]: "搜索面板",
		[UiLabelKey.resetToDefault]: "恢复默认",
		[UiLabelKey.lightDarkMode]: "明暗模式",
		[UiLabelKey.switchToChinese]: "切换为中文",
		[UiLabelKey.switchToEnglish]: "切换为英文",
		[UiLabelKey.docs]: "文档",
		[UiLabelKey.documentation]: "文档系列",
		[UiLabelKey.backToDocs]: "返回文档",
	},
	en: {
		[UiLabelKey.language]: "Page language",
		[UiLabelKey.displaySettings]: "Display settings",
		[UiLabelKey.navigationMenu]: "Navigation menu",
		[UiLabelKey.searchPanel]: "Search panel",
		[UiLabelKey.resetToDefault]: "Reset to default",
		[UiLabelKey.lightDarkMode]: "Light and dark mode",
		[UiLabelKey.switchToChinese]: "Switch to Chinese",
		[UiLabelKey.switchToEnglish]: "Switch to English",
		[UiLabelKey.docs]: "Docs",
		[UiLabelKey.documentation]: "Documentation",
		[UiLabelKey.backToDocs]: "Back to docs",
	},
};
