#!/usr/bin/env python3
"""Simulador de cenário para operação de mídia própria; NÃO é previsão nem acesso a plataformas.

Uso:
    python calculadora_monetizacao.py --storage-gb 50 --provider b2 --usd-brl 5.34
    python calculadora_monetizacao.py --storage-gb 150 --provider r2 --eligible --views-long 100000 --rpm-long 6 --own-hours 20 --hour-rate 80

Zero receita até monetização oficialmente habilitada. Zero custo adicional já pago somente após validação.
"""
from __future__ import annotations
import argparse
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP

D = Decimal

def money(n: Decimal) -> Decimal:
    return n.quantize(D('0.01'), rounding=ROUND_HALF_UP)


def cash(n: Decimal) -> str:
    return f"R$ {money(n):,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')


def storage_cost_usd(provider: str, gb_month: Decimal) -> Decimal:
    if not gb_month.is_finite() or gb_month < 0:
        raise ValueError('armazenamento deve ser finito e não negativo')
    chargeable = max(D('0'), gb_month-D('10'))
    if provider == 'b2':
        # Hipótese de conversão TB=1000 GB para planejamento, verificar unidade real na fatura.
        return chargeable * D('6.95') / D('1000')
    if provider == 'r2':
        return chargeable * D('0.015')
    raise ValueError('provedor não reconhecido')


def model(*, provider: str, gb_month: Decimal, usd_brl: Decimal, eligible: bool,
          views_long: Decimal, rpm_long: Decimal, views_shorts: Decimal, rpm_shorts: Decimal,
          additional_cost: Decimal, other_actual_revenue: Decimal, taxes_rate: Decimal,
          own_hours: Decimal, hour_rate: Decimal, economic_allocations: Decimal) -> dict:
    for key, value in locals().copy().items():
        if isinstance(value, Decimal) and (not value.is_finite() or value < 0):
            raise ValueError(f'{key} deve ser finito e não negativo')
    if usd_brl == 0:
        raise ValueError('usd_brl deve ser maior que zero')
    if taxes_rate > 1:
        raise ValueError('taxes_rate deve estar entre 0 e 1')
    storage_brl = money(storage_cost_usd(provider, gb_month)*usd_brl)
    # 'other_actual_revenue' só pode ser incluída para pagamentos efetivamente confirmados, nunca estimativas hipotéticas de outras plataformas.
    revenue = ((money(views_long/1000*rpm_long)+money(views_shorts/1000*rpm_shorts)) if eligible else D(0)) + money(other_actual_revenue)
    taxes = money(revenue*taxes_rate)
    cash_cost = storage_brl + money(additional_cost)
    cash_result = revenue - taxes - cash_cost
    economic_result = cash_result - money(own_hours*hour_rate) - money(economic_allocations)
    # Cenário exclusivamente de longos: não compensa custos com Shorts ou outras receitas.
    net_long_rpm = rpm_long * (1 - taxes_rate)
    breakeven = ((cash_cost * 1000 / net_long_rpm).to_integral_value(rounding=ROUND_CEILING)
                 if eligible and net_long_rpm > 0 else None)
    return {'backup_brl':storage_brl, 'gross_revenue_brl':revenue, 'taxes_brl':taxes, 'additional_cash_cost_brl':cash_cost,
            'cash_result_brl':cash_result, 'economic_result_brl':economic_result,
            'long_views_for_breakeven': breakeven}


def main():
    ap=argparse.ArgumentParser(description='Custo adicional de backup e receita da monetização oficial - cenários hipotéticos')
    ap.add_argument('--provider', choices=['b2','r2'], default='b2')
    ap.add_argument('--storage-gb', type=Decimal, default=D(50), help='volume médio GB-mês; não confundir com total no final do mês')
    ap.add_argument('--usd-brl', type=Decimal, default=D('5.34'), help='câmbio de SIMULAÇÃO, não cotação atual')
    ap.add_argument('--eligible', action='store_true', help='assinale SOMENTE quando a monetização YouTube já estiver oficialmente ativa')
    ap.add_argument('--views-long', type=Decimal, default=D(0), help='views longas qualificadas, hipótese')
    ap.add_argument('--rpm-long', type=Decimal, default=D(0), help='RPM vídeos longos R$/mil, observado ou hipótese')
    ap.add_argument('--views-shorts', type=Decimal, default=D(0), help='engaged/qualified views Shorts, hipótese')
    ap.add_argument('--rpm-shorts', type=Decimal, default=D(0), help='RPM específico de Shorts R$/mil')
    ap.add_argument('--other-actual-revenue', type=Decimal, default=D(0), help='TikTok/Facebook apenas valores efetivamente apurados')
    ap.add_argument('--additional-cost', type=Decimal, default=D(0), help='outros custos NOVOS autorizados, se houver; nunca inserir VPS/energia já pagos')
    ap.add_argument('--taxes-rate', type=Decimal, default=D(0), help='alíquota efetiva hipotética (0 a 1); usar zero se desconhecida e ver aviso')
    ap.add_argument('--own-hours', type=Decimal, default=D(0), help='horas pessoais no mês')
    ap.add_argument('--hour-rate', type=Decimal, default=D(0), help='valor econômico por hora')
    ap.add_argument('--economic-allocations', type=Decimal, default=D(0), help='rateios/depreciação, informativos')
    a=ap.parse_args()
    try:
        r=model(provider=a.provider,gb_month=a.storage_gb,usd_brl=a.usd_brl,eligible=a.eligible,
                views_long=a.views_long,rpm_long=a.rpm_long,views_shorts=a.views_shorts,rpm_shorts=a.rpm_shorts,
                other_actual_revenue=a.other_actual_revenue,additional_cost=a.additional_cost,taxes_rate=a.taxes_rate,
                own_hours=a.own_hours,hour_rate=a.hour_rate,economic_allocations=a.economic_allocations)
    except ValueError as error:
        ap.error(str(error))
    print('PROJEÇÃO HIPOTÉTICA - NÃO É PREVISÃO DE RENDA')
    print(f"Backup {a.provider.upper()} ({a.storage_gb} GB-mês): {cash(r['backup_brl'])}")
    print(f"Receita considerada: {cash(r['gross_revenue_brl'])}")
    print(f"Custos novos totais: {cash(r['additional_cash_cost_brl'])}")
    print(f"Tributos simulados: {cash(r['taxes_brl'])}")
    print(f"Resultado de caixa: {cash(r['cash_result_brl'])}")
    print(f"Resultado econômico (horas + rateios): {cash(r['economic_result_brl'])}")
    if r['long_views_for_breakeven'] is not None:
        print(f"Equilíbrio teórico só com longos, após tributos simulados: {r['long_views_for_breakeven']} views longas/mês")
    else:
        print('Equilíbrio de anúncios: INDISPONÍVEL sem elegibilidade e RPM líquido > 0')
    print('AVISO: exclui IOF, spread, possíveis taxas de cartão, arredondamentos R2 e tributos desconhecidos.')
    print('AVISO: assinatura de IA e VPS existentes só têm custo adicional zero se cotas/capacidade bastarem.')

if __name__=='__main__':
    main()
