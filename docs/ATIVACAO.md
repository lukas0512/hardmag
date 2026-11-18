# Ativar o HARDMAG hoje

Tempo total: ~40 min. Os passos 1–3 só você pode fazer (criação de conta e tokens).

## Como funciona
```
3x por dia (GitHub Actions, de graça)
  RSS de 12 revistas  →  Claude (sua assinatura) escolhe a melhor notícia e escreve  →  arte da marca (2 slides)
  →  imagem hospedada no próprio repositório  →  publicado no Instagram via API oficial
```
Não repete notícia (estado salvo em `state/state.json`) e junta a mesma história vinda de várias fontes.

---

## 1. Criar a conta no Instagram (10 min)
1. Crie a conta **@hardmag.news** (ou outra da lista em `brand/IDENTIDADE.md`).
2. Configurações → *Tipo de conta e ferramentas* → **Mudar para conta profissional** → **Empresa** → categoria *Media/News Company*.
3. Foto de perfil: `brand/kit/profile-picture.png`. Nome e bio: copie de `brand/IDENTIDADE.md`.
4. Publique à mão os 3 posts de lançamento (`brand/kit/launch-3.jpg`, depois `2`, depois `1`).

> Conta nova postando por API 3x/dia desde o primeiro minuto pode ser vista como spam. Use a conta à mão no primeiro dia (seguir perfis do nicho, curtir, comentar) e deixe a automação começar em seguida.

## 2. Token da API do Instagram (15 min)
Usamos a **Instagram API com login do Instagram**: não precisa de Página do Facebook.
1. Entre em <https://developers.facebook.com/apps> → **Criar app** → caso de uso **"Gerenciar mensagens e conteúdo no Instagram"** → tipo *Empresa*.
2. No app: **Instagram → Configuração da API com login do Instagram**.
3. Em *Gerar tokens de acesso*: **Adicionar conta** → entre com a @hardmag.news → autorize.
   Permissões necessárias: `instagram_business_basic` e `instagram_business_content_publish`.
4. Clique **Gerar token** e copie (é o token de longa duração, vale 60 dias).
5. O app pode ficar em modo *desenvolvimento*: para publicar na sua própria conta não precisa de revisão da Meta.

Teste local:
```bash
cp .env.example .env
```
Cole o token em `IG_ACCESS_TOKEN` no `.env` e rode:
```bash
npm run ig-check
```
Ele imprime o `IG_USER_ID`. Cole no `.env` também.

## 3. Claude pela sua assinatura (2 min)
Os textos são escritos pelo Claude Code usando a **sua assinatura do Claude** (Pro ou Max). Não precisa de chave de API e não tem custo extra. São 6 chamadas curtas por dia, bem dentro do limite da assinatura.
- **No seu Mac:** nada a fazer. O pipeline usa o Claude Code em que você já está logado.
- **No GitHub:** rode no Terminal
  ```bash
  claude setup-token
  ```
  Ele abre o navegador, você autoriza e ele imprime um token (vale 1 ano). Guarde-o para o passo 5.

## 4. Ver os posts antes de ligar (2 min)
```bash
npm run preview
```
Gera 4 posts em `out/` sem publicar nada. Abra as imagens e o `caption.txt` de cada pasta.

## 5. Ligar no GitHub (5 min)
O repositório precisa ser **público**: o Instagram baixa as imagens de uma URL pública, e elas ficam no branch `media` do próprio repo. Nenhuma chave fica no código.
1. Crie o repo e suba o código.
2. *Settings → Secrets and variables → Actions → New repository secret*:
   `CLAUDE_CODE_OAUTH_TOKEN` (o token do passo 3), `IG_ACCESS_TOKEN`, `IG_USER_ID`
3. (Se o @ não for hardmag.news) em *Variables*: `BRAND_HANDLE` = `@seu.arroba`
4. *Actions → HARDMAG — post → Run workflow* com **dry = true** para testar, depois **dry = false** para o primeiro post de verdade.

Pronto. A partir daí roda sozinho às 09:00, 14:00 e 19:00 (UTC).

## 6. Token que não expira (opcional, recomendado)
O token vale 60 dias. Para renovar sozinho a cada 15 dias, crie um *fine-grained token* do GitHub para este repo com permissão **Secrets: read and write** e salve como secret `GH_PAT`. O workflow *HARDMAG — refresh Instagram token* cuida do resto. Sem isso, rode `npm run refresh-token` uma vez por mês.

---

## Ajustes rápidos
| Quero… | Onde |
|---|---|
| Mais/menos posts por dia | horários `cron` em `.github/workflows/post.yml` |
| Mudar fontes de notícia | `src/sources.ts` |
| Mudar o tom/linha editorial | texto `VOICE` em `src/write.ts` |
| Mudar visual | `brand/brand.css` e `src/templates.ts` |
| Refazer kit de marca | `npm run brand` |

## Direitos de imagem
As capas usam a foto de divulgação que a própria matéria publicou, com crédito na legenda ("📸 via Fonte"). É a prática comum em perfis de notícia do nicho, mas não é licença: se algum fotógrafo ou revista pedir remoção, apague o post na hora. Se preferir risco zero, dá para trocar por capas só tipográficas.
