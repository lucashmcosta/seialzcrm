// Desativada em 08/11/2026: função de uso único, sem autenticação e sem uso
// (sem referência no código, sem cron, sem chamada nos logs). Não executa nada.
// O código original está no histórico do git (antes do PR de desativação).
Deno.serve(() =>
  new Response(
    JSON.stringify({ error: "gone", function: "meta-lead-ads-viagi-token-probe", message: "This one-shot function has been disabled." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
