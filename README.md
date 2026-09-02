will-wallet
=======

A self-custody Bitcoin wallet focused on inheritance and distribution planning, built entirely in JavaScript and designed to run in your browser.

Live version available at https://will-wallet.com/

Github URL: https://github.com/lbtil/will-wallet

Will-Wallet supports a number of key features, including:

- Offline compressed & uncompressed address creation.
- Offline multisignature address creation.
- "In browser" key (re)generation.
- Send and receive payments.
- Ability to decode transactions, redeem scripts and more, offline.
- Build custom transactions offline.
- Sign transactions offline.
- Signatures are deterministic as per RFC 6979 (https://tools.ietf.org/html/rfc6979#section-3.2)
- Broadcast transactions, either via a public blockchain service or your own Bitcoin Core node (see Settings).
- nLockTime and CHECKLOCKTIMEVERIFY timelock support.
- Add custom data to transactions with the use of OP_RETURN.
- Brain wallet support.
- Compatible with Bitcoin Core.
- Offline QR code creator and scanning tool.
- HD (BIP32) support.
- Replace by fee (RBF) support.
- SegWit support.
- Bech32 address support.
- An inheritance plan builder: describe beneficiaries, portions, and unlock dates, and have Will-Wallet compile a multisig, timelocked distribution transaction and per-beneficiary distribution packages &mdash; without any custodian ever holding a working key.

Will-Wallet is free and open source software, released under the MIT license (see LICENSE). It began as a fork of the coinjs/coinb.in project by OutCast3k, whose original MIT-licensed code it continues to use for its core Bitcoin transaction engine.
