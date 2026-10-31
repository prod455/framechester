import './basecoat.css';
import './styles.css';
import { detectLocale, languageTag, locale, setLocale } from '../shared/i18n.ts';

// The language is settled before any screen module loads, so messages built at import time
// already use it.
setLocale(detectLocale(navigator.languages));
document.documentElement.lang = languageTag(locale());
const { start } = await import('./studio/shell.ts');
void start();
