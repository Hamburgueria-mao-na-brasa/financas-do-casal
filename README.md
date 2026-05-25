# DuoFin

App financeiro compartilhado para casal.

## Arquivos do site

- `index.html`
- `styles.css`
- `app.js`
- `manifest.json`
- `app-icon.svg`
- `sw.js`

## Antes de publicar

Execute o arquivo `supabase-v2.sql` no SQL Editor do Supabase.

Esse SQL cria tabelas novas com prefixo `duofin_v2_`, sem apagar as tabelas antigas.

Se o app ja estiver publicado, rode o SQL atualizado novamente quando houver nova versao do arquivo. Ele usa `create if not exists` e `drop policy if exists`, entao atualiza as permissoes sem apagar os dados.

## Publicar no GitHub Pages

1. Crie um repositório novo no GitHub.
2. Envie os arquivos do site para a raiz do repositório.
3. Abra `Settings > Pages`.
4. Em `Build and deployment`, escolha `Deploy from a branch`.
5. Escolha a branch `main` e a pasta `/root`.
6. Clique em `Save`.

Depois de alguns minutos, o GitHub Pages vai gerar o link do app.
