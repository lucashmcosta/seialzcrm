# Módulo: Billing

Rota: `/settings/billing`.

## Comportamento
- Grandfathering de preço e trials manuais via cupons (`coupons`, `coupon_redemptions`). `[INCERTO — regra exata de grandfathering não reconstituída; validar no código antes de alterar]`
- Limite de assentos usado em `create-user` (via `subscriptions`).
