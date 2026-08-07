#!/usr/bin/env sh
# Fetch the corpora the pipeline reads. They are gitignored — multi-megabyte,
# and separately licensed. See README.md for what each one is and its licence.
set -eu
cd "$(dirname "$0")"

echo "sv_SE.dic  — Swedish hunspell dictionary (SFOL/DSSO lineage, LGPL-3.0)"
curl -sSLf -o sv_SE.dic \
  https://raw.githubusercontent.com/yeager/hunspell-sv/master/sv_SE.dic

# The affix file is the authority for what the .dic's flag letters mean. The
# pipeline hardcodes the few it acts on, and this is where those came from —
# reading the .dic without FORBIDDENWORD is how misspellings like barrock and
# hårrock were once shipped as valid compounds.
echo "sv_SE.aff  — the affix file: what the .dic's flags mean"
curl -sSLf -o sv_SE.aff \
  https://raw.githubusercontent.com/yeager/hunspell-sv/master/sv_SE.aff

echo "sv_50k.txt — hermitdave FrequencyWords, Swedish (MIT)"
curl -sSLf -o sv_50k.txt \
  https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/sv/sv_50k.txt

wc -l sv_SE.dic sv_50k.txt
