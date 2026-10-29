export function number(value: number | null | undefined): string {
  return value == null ? '—' : new Intl.NumberFormat('pt-BR').format(value);
}

export function date(value?: string | null): string {
  if (!value) return 'Sem registro';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? 'Data não disponível'
    : parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
