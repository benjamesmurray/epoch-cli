  Step 1: SDK
cd packages/sdk/js
npm publish --tag latest --access public

  Step 2: Plugin
cd packages/plugin
npm publish --tag latest --access public

  Step 3: CLI & Binaries

cd packages/epochcli/dist
for d in epochcli-ai-*; do
if [ -d "$d" ]; then
echo "Publishing $d..."
(cd "$d" && npm publish --tag latest --access public)
fi
done

cd packages/epochcli
   12 npm publish --tag latest --access public