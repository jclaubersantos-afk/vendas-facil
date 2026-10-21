# Vendalume Gestão — versão de validação

O Vendalume Gestão tem uma única fonte de código. O APK de validação é temporário e gerado a partir dessa mesma base; não há um aplicativo Principal e outro Teste mantidos em paralelo.

## Estado desta etapa

- Painel responsivo em modo escuro e navegação para equipe, metas, relatórios e aparelhos.
- Login de gerente com Supabase Auth, criação inicial do negócio e leitura dos dados protegidos por RLS.
- Cadastro de vendedores, geração de código de vínculo de uso único (armazenado como hash) e gerenciamento de aparelhos.
- Esta etapa ainda não sincroniza vendas do Vendalume. Até completar a integração do lado vendedor, os relatórios de vendas ficam vazios.
- A versão instalada anteriormente é apenas a prévia visual; não a use para uma venda real.
- O Vendalume Principal e sua página publicada não são alterados.

## Build de validação

O workflow `build-gestao-preview.yml` compila o APK Android temporário e publica somente um artefato de curta duração do GitHub Actions. Não cria uma release e não executa a build do Vendalume Principal.

## Antes de liberar venda de teste

1. Conectar o fluxo de vínculo no Vendalume e autenticação anônima do aparelho.
2. Implementar fila offline idempotente para novas vendas, edições e cancelamentos.
3. Testar separação entre empresas, códigos de uso único, reenvio offline e relatórios.
4. Validar os dois aplicativos juntos antes de pedir uma venda descartável.
