# DeepSeek Harness Desktop

Windows desktop wrapper for DeepSeek Harness.

## Development

```powershell
pnpm install
pnpm run build
pnpm start
```

The development build starts `dsh web` from the sibling `deepseek-harness-master` workspace.

## Packaging

```powershell
pnpm run pack
```

This builds the TypeScript sources, prepares a standalone backend with `pnpm deploy`, and produces an NSIS installer and a portable executable under `release/`.
