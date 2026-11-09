// Desativada: nenhuma tela chama esta função, e ela gastava IA sem login. Fica como 410 para
// um chamador antigo receber resposta clara em vez de erro de função inexistente.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(() => new Response(JSON.stringify({ error: "gone" }), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
