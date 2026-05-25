# Команды для GitHub Codespaces agent

Сценарий: открыт новый пустой репозиторий в Codespaces, ZIP загружен в корень workspace.

```bash
set -euo pipefail

cd "${CODESPACE_VSCODE_FOLDER:-$PWD}"

ZIP_FILE="sc-trade-routes-pages-sc-only-release.zip"
if [ ! -f "$ZIP_FILE" ]; then
  ZIP_FILE=$(ls -1 *.zip | head -n 1)
fi

echo "ZIP: $ZIP_FILE"

rm -rf /tmp/sc-trade-pages-import
mkdir -p /tmp/sc-trade-pages-import
unzip -o "$ZIP_FILE" -d /tmp/sc-trade-pages-import

SRC_DIR=$(find /tmp/sc-trade-pages-import -maxdepth 3 -type f -name package.json -exec dirname {} \; | head -n 1)
if [ -z "$SRC_DIR" ]; then
  echo "ERROR: package.json not found inside ZIP"
  exit 1
fi

echo "Project source: $SRC_DIR"

rsync -av --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='*.zip' \
  "$SRC_DIR"/ ./

# Проверка: в проекте не должно быть ссылок на старый внешний API.
if grep -RniE '[Uu][Ee][Xx]|api\.[Uu][Ee][Xx]|[Uu][Ee][Xx]corp' . --exclude-dir=.git; then
  echo "ERROR: forbidden old API references found"
  exit 1
fi

node --version
npm run build:data

git status
git add .
git commit -m "Release SC Trade Tools only GitHub Pages build"
git branch -M main
git push -u origin main
```

После push:

1. GitHub → Settings → Pages.
2. Build and deployment → Source → GitHub Actions.
3. Actions → Build and deploy GitHub Pages → Run workflow.
