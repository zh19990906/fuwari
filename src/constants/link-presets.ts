import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { UiLabelKey, uiLanguageLabels } from "@i18n/ui-language-labels";
import { LinkPreset, type NavBarLink } from "@/types/config";

export const LinkPresets: { [key in LinkPreset]: NavBarLink } = {
	[LinkPreset.Home]: {
		name: i18n(I18nKey.home),
		url: "/",
		i18nKey: I18nKey.home,
	},
	[LinkPreset.About]: {
		name: i18n(I18nKey.about),
		url: "/about/",
		i18nKey: I18nKey.about,
	},
	[LinkPreset.Archive]: {
		name: i18n(I18nKey.archive),
		url: "/archive/",
		i18nKey: I18nKey.archive,
	},
	[LinkPreset.Docs]: {
		name: uiLanguageLabels.zh_CN[UiLabelKey.docs],
		url: "/docs/",
		i18nKey: UiLabelKey.docs,
	},
	[LinkPreset.Activity]: {
		name: uiLanguageLabels.zh_CN[UiLabelKey.activity],
		url: "/activity/",
		i18nKey: UiLabelKey.activity,
	},
};
