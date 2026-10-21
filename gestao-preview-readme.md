# Vendalume Gestão — versão inicial de validação

Este diretório é a única fonte de código do Vendalume Gestão. O APK de validação é gerado temporariamente a partir desta mesma fonte; não existe um aplicativo Principal e outro Teste mantidos em paralelo.

## Estado desta etapa

- Painel responsivo em modo escuro, identidade Vendalume Gestão e navegação inicial.
- Ações de navegação, busca, filtros demonstrativos, código fictício de vínculo e impressão do painel.
- Todos os indicadores e vendedores exibidos são fictícios e estão identificados como demonstração.
- Ainda não há login real, banco conectado, vínculo de aparelhos ou sincronização de vendas.
- O Vendalume Principal e o Supabase não são alterados por esta prévia.

## Build de validação

O workflow `build-gestao-preview.yml` compila o APK temporário e publica somente um artefato de curta duração do GitHub Actions. Ele não cria release nem executa a build do Vendalume Principal.

## Próximas etapas

1. Revisar a interface e a acessibilidade em celular.
2. Validar e aplicar, separadamente, o rascunho de esquema do Supabase e as políticas de acesso.
3. Implementar login do gerente, vínculo de uso único e associação do aparelho ao vendedor.
4. Integrar a fila offline do Vendalume e a sincronização idempotente de vendas, alterações, cancelamentos e comissões.
5. Testar isolamento entre negócios, modo offline, relatórios e permissões antes de distribuir a versão de validação.
