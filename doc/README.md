# doc/

This folder is where a locally-run copy of Will-Wallet suggests you keep saved
inheritance plan `.json` files (downloaded from the Inheritance Plan builder once a
plan has been built and signed — see the "Download Plan" button).

**Nothing in this folder is tracked by git except this file and `.gitkeep`** — see
the root `.gitignore`. Your saved plans stay on your own machine and are never
committed to this repository or uploaded anywhere; Will-Wallet itself never writes
here automatically (a browser can't write directly into an arbitrary folder), this
is simply the suggested destination when your browser's save/download dialog asks
you where to put the file.

A saved plan `.json` contains the same plan data Will-Wallet already keeps as a
local draft — beneficiary labels, portions, dates, public keys, and the built/signed
transaction — never a private key. It can be reopened later, in this copy of
Will-Wallet or another one, using "Load Plan" on the Inheritance Plan page.
