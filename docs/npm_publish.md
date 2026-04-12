Step 1: SDK

   1 cd /home/benmurray/Projects/cli/packages/sdk/js
   2 run: npm publish --tag latest --access public

  Step 2: Plugin

   1 cd /home/benmurray/Projects/cli/packages/plugin
   2 run: npm publish --tag latest --access public

  Step 3: CLI & Binaries

   1 cd /home/benmurray/Projects/cli/packages/epochcli
Run:

for d in epochcli-ai-*; do
if [ -d "$d" ]; then
echo "Publishing $d..."
(cd "$d" && npm publish --tag latest --access public)
fi
done