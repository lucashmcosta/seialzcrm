# Modelo de dados — Base de Conhecimento

| Tabela | Papel |
|---|---|
| `knowledge_items` | 27 col — item raiz (doc/página/produto) |
| `knowledge_chunks` | 8 col — chunks de texto |
| `knowledge_embeddings` | 10 col — vetores Voyage |
| `knowledge_item_history` | 15 col — versão histórica |
| `knowledge_edit_requests` | 11 col — solicitações de edição |
| `products` | 11 col — pode ser fonte de knowledge |
| `documentation` | 10 col — documentação interna |

RPCs: `search_knowledge_global`, `search_knowledge_all`, `search_knowledge_product`.
