export interface LanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  isDefault: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { code: 'en', name: 'English', nativeName: 'English', isDefault: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', isDefault: false },
  { code: 'fr', name: 'French', nativeName: 'Français', isDefault: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', isDefault: false },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', isDefault: false },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', isDefault: false },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', isDefault: false },
  { code: 'ko', name: 'Korean', nativeName: '한국어', isDefault: false },
  { code: 'zh', name: 'Chinese', nativeName: '中文', isDefault: false }
];

export const DEFAULT_LANGUAGE = 'en';

export const getLanguageConfig = (code: string): LanguageConfig | undefined => {
  return SUPPORTED_LANGUAGES.find(lang => lang.code === code);
};

export const getDefaultLanguage = (): LanguageConfig => {
  return SUPPORTED_LANGUAGES.find(lang => lang.isDefault) || SUPPORTED_LANGUAGES[0];
};

export const getSupportedLanguageCodes = (): string[] => {
  return SUPPORTED_LANGUAGES.map(lang => lang.code);
};

export const isLanguageSupported = (code: string): boolean => {
  return SUPPORTED_LANGUAGES.some(lang => lang.code === code);
};

export const getLanguageInstructions = (): string => {
  return `LANGUAGE POLICY:
- Your DEFAULT and PRIMARY language is ENGLISH
- Always start conversations in English
- Only switch to another language if the user explicitly requests it
- If asked to speak Spanish, French, German, or any other language, then switch to that language for the conversation
- When switching languages, acknowledge the language change and continue in the requested language
- If no language is specified, always use English

Remember: English first, other languages only when requested.`;
};
