# Kuaa Admin

Painel de geração e revisão de questões do ecossistema **Kuaa**: ferramenta de trabalho interno que hospeda o motor de dificuldade BNCC (rota `/dificuldade`) usada para calibrar as provas do app do estudante.

## O que tem

- **Aba Amostras**: monta e revisa amostras do acervo para calibragem.
- **Aba Avaliador**: avalia questões quanto ao nível de dificuldade (1–5).
- **Aba Config**: parâmetros do motor (pesos, faixas, metas por ano).
- **Aba Lote**: processa lotes inteiros de questões de uma vez.
- **Motor compartilhado** em `shared/dificuldade/` com **testes de paridade** (`pnpm test`, 34 testes) — é a mesma lógica que embute `dificuldade_nivel` no contrato `kuaaFormat`.
- **CLI** `scripts/classificar-dificuldade.ts` para classificação em massa fora da UI.

## Privacidade e armazenamento

- Trabalha sobre arquivos locais do acervo; nada sai do computador.
- Backup opcional no Google Drive (escopo mínimo `drive.appdata`, PKCE) quando conectado ao fluxo do ecossistema.

## Requisitos

- Node 20+ e pnpm.

## Como executar em desenvolvimento

```bash
pnpm install
pnpm dev      # painel local
pnpm test     # 34 testes de paridade do motor
```

## Como gerar o build

```bash
pnpm build    # build web de produção
```

O build é a base do aplicativo **Kuaa Gerenciador de Provas** (MSIX para Windows), empacotado no repositório [Kuaa-admin-MSIX](https://github.com/wavizo-bot/Kuaa-admin-MSIX).

## Estrutura de pastas

- `client/` — painel React (páginas das abas em `client/src/pages/dificuldade/`)
- `shared/dificuldade/` — motor de dificuldade + testes (fonte da verdade da paridade)
- `scripts/` — utilitários (CLI de classificação, checagens)
- `manual.txt`, `CHANGES.md` — documentação do projeto; `log.txt` é local (não versionado)

## Versão atual

**1.0.0** — primeira publicação do repositório (29/10/2026).

## Links

- Pacote Windows: https://github.com/wavizo-bot/Kuaa-admin-MSIX
- Banco de dados de provas: https://github.com/wavizo-bot/KuaaRepo

## Contato

E-mail **mmr05@hotmail.com** · Telefone **11978831938**

---

## English summary

**Kuaa Admin** is the internal question-generation and review panel for the Kuaa ecosystem. It hosts the BNCC-aligned difficulty engine (`shared/dificuldade/`, with 34 parity tests) used to calibrate the student app's exam bank, plus a batch CLI. It works on local files only, optional Google Drive backup (`drive.appdata`, PKCE). Its build backs the Windows MSIX app *Kuaa Gerenciador de Provas*. Contact: mmr05@hotmail.com.
