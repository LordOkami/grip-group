export const languages = {
  es: 'Español',
  en: 'English',
};

export const defaultLang = 'es';

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split('/');
  if (lang in languages) return lang as keyof typeof languages;
  return defaultLang;
}

export function useTranslatedPath(lang: keyof typeof languages) {
  return function translatePath(path: string, l: string = lang) {
    return l === defaultLang ? path : `/${l}${path}`;
  };
}

export async function getContent(lang: string, page: string) {
  try {
    const content = await import(`../content/pages/${lang}/${page}.json`);
    return content.default;
  } catch {
    // Fallback to Spanish if translation doesn't exist
    const content = await import(`../content/pages/es/${page}.json`);
    return content.default;
  }
}

export async function getNavigation(lang: string) {
  const nav = await import('../content/settings/navigation.json');
  return nav.default[lang as keyof typeof nav.default] || nav.default.es;
}

// UI translations for common elements
export const ui = {
  es: {
    'nav.historia': 'Historia',
    'nav.motos': 'Motos',
    'nav.inscripciones': 'Inscripciones',
    'nav.cta': 'Inscríbete',
    'footer.rights': 'Todos los derechos reservados.',
    'footer.inspired': 'Inspirado en FreeTech Endurance UK',
    'footer.links': 'Enlaces',
    'footer.contact': 'Contacto',
    'footer.description': 'La experiencia definitiva del motorsport amateur. 8 horas de pura resistencia sobre motos 125cc de serie.',
    'lang.switch': 'English',
  },
  en: {
    'nav.historia': 'Story',
    'nav.motos': 'Bikes',
    'nav.inscripciones': 'Registration',
    'nav.cta': 'Register',
    'footer.rights': 'All rights reserved.',
    'footer.inspired': 'Inspired by FreeTech Endurance UK',
    'footer.links': 'Links',
    'footer.contact': 'Contact',
    'footer.description': 'The ultimate amateur motorsport experience. 8 hours of pure endurance on stock 125cc motorcycles.',
    'lang.switch': 'Español',
  },
} as const;

export function useTranslations(lang: keyof typeof ui) {
  return function t(key: keyof typeof ui[typeof defaultLang]) {
    return ui[lang][key] || ui[defaultLang][key];
  };
}
