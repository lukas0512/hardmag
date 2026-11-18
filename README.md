# HARDMAG

Automated Instagram news magazine for techno & house. Every run it reads 12 electronic music feeds, lets Claude (via Claude Code, on a Claude subscription) pick and write the best story, renders a branded 2-slide carousel, and publishes it through the Instagram API.

- Setup / go-live guide (PT): [docs/ATIVACAO.md](docs/ATIVACAO.md)
- Brand identity (PT): [brand/IDENTIDADE.md](brand/IDENTIDADE.md)

```bash
npm install && npx playwright install --only-shell chromium
npm run preview        # render 4 posts into out/, publish nothing
npm run run            # one live post
npm run brand          # rebuild the brand kit in brand/kit/
npm run ig-check       # verify the Instagram token, print IG_USER_ID
npm run refresh-token  # renew the 60-day Instagram token
```

Pipeline: `src/fetch.ts` (RSS + article + image) → `src/write.ts` (`claude -p`: pick + write) → `src/templates.ts` + `src/render.ts` (HTML → JPEG) → `src/publish.ts` (GitHub-hosted image → Instagram Graph API). Scheduled by `.github/workflows/post.yml`.
