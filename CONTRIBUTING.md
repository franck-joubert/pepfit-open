# Contributing

Thanks for your interest. A few rules keep the code base consistent.

1. **Local first.** The app works without any server. A feature that needs a network service must stay optional and
   must not send personal data anywhere the user did not choose.
2. **No credentials in the code.** API keys, client secrets and signing keys never go in the repository. Third-party
   APIs use the user's own credentials (see [SELF-HOSTING.md](SELF-HOSTING.md)).
3. **Code style.** TypeScript strict. The code base is written in French (identifiers and comments); keep it so in the
   files you touch. Match the surrounding code: same naming, same comment density.
4. **Texts.** Every user-visible string goes through `t()` and exists in the four dictionaries
   (`app/src/i18n/dico-{fr,en,de,es}/`).
5. **Tests.** Pure logic gets a unit test in `app/tests/`. Before opening a pull request:

   ```bash
   cd app && npx tsc --noEmit && npm test
   ```

6. **Database.** Schema changes are new migrations; never edit a migration that has shipped.

By contributing, you agree that your contribution is licensed like the files it touches: code under the GNU AGPL v3
only (`AGPL-3.0-only`), artwork under CC BY-SA 4.0 (see [LICENSE-ASSETS](LICENSE-ASSETS) and [REUSE.toml](REUSE.toml)).
