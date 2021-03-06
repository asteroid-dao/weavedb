---
sidebar_position: 1
---

# Introduction

## What is WeaveDB?

WeaveDB is a NoSQL database powered by [Warp Contracts](https://warp.cc/) (SmartWeave) on the [Arweave](https://www.arweave.org/) blockchain.

The query APIs are similar to [Firestore](https://firebase.google.com/docs/firestore) from Google but completely decentralized.

- Data is stored on the Arweave permanent storage where anyone can access without permission.
- User authentication is done by pure cryptography using crypto wallets such as MetaMask and ArConnect.
- SmartWeave makes it possible to apply complex computation to stored data for web-centric large-scale dapps just like web2 apps.

## Crypto Account Authentication

Database access is permissionless and authentication is done with pure cryptography, which authorizes EVM-based accounts with [EIP-712](https://eips.ethereum.org/EIPS/eip-712) signatures on SmartWeave contracts.

Other types of crypto accounts will be supported in the future such as Arweave and Polkadot.

## Demo Dapps

The v0.2 contract is deployed on the Warp mainnet at [Ndw5zrbokHM4uFWaEVRQwPYr6PwLme16O4cnxZ0pgV4](https://sonar.warp.cc/?#/app/contract/Ndw5zrbokHM4uFWaEVRQwPYr6PwLme16O4cnxZ0pgV4).

### Todo Manager

A v0.2 demo dapp (Todo Manager) is deployed at [weavedb-todos.asteroid.ac](https://weavedb-todos.asteroid.ac).

- [Dapp Building Tutorial](/docs/examples/bookmarks)

### Mirror Social Bookmarking

A v0.2 demo dapp (Social Bookmarking) is deployed at [asteroid.ac](https://asteroid.ac).

- [Dapp Building Tutorial](/docs/examples/bookmarks)

:::caution
WeaveDB is still in its infancy. Everything is subject to change.
:::
