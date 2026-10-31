import { languageTag, t } from '../shared/i18n.ts';

export function number(value: number | null | undefined): string {
  return value == null ? '—' : new Intl.NumberFormat(languageTag()).format(value);
}

export function date(value?: string | null): string {
  if (!value) return t('Sem registro');
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? t('Data não disponível')
    : parsed.toLocaleString(languageTag(), { dateStyle: 'short', timeStyle: 'short' });
}
