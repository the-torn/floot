# Floot = Fair Loot

Floot is a blind drop implementation of Loot, designed to address [concerns](https://medium.com/@iamthetorn/stop-forking-loot-its-kind-of-broken-f1a1c986784d) around the smart contract design of [Loot](http://lootproject.com/). A secondary goal is to reduce gas costs for users.

Advantages of Floot over Loot and other approaches to on-chain randomness include:
* Fair and random distribution of tokens.
* Resistant to frontrunning, dark pools, and manipulation by miners.
* Resistant to cheating by the NFT creator.
* Contract has no owner and there is no founder allocation.
* Estimated 31% reduction in gas cost per mint.

Limitations:
* None of the tokens are visible until after the end of the token distribution.

## Security design

### Overview

Like Loot, a Floot token consists of a Bag of eight items, rendered fully on-chain as an SVG.

In Loot, the items in a Bag are picked according to a “random” value which is determined by:

1. The token ID (1 through 8000)
2. A fixed prefix for each of the eight “slots” in the bag (`WEAPON`, `CHEST`, etc.)

In Floot, we add a third value as an input to randomness:

3. A global random seed generated securely after the end of the token distribution.

All minting is “blind” as the Bags are only revealed after minting has ended. The randomness of the distribution depends fully upon the process for generating the seed. Our method for doing so is inspired by the Hashmasks blind drop.

### Analysis of Hashmasks on-chain randomness

The Floot blind drop design is based on the Hashmasks smart contract, which was adopted by BAYC and many other NFT projects. When used correctly, their method ensures that the token distribution is fair and random such that even the team launching the token cannot manipulate the drop to get better or specific tokens.

It works as follows:

1. Before the sale, the team computes a [provenance hash](https://www.thehashmasks.com/provenance.html) which is a commitment to the exact NFT images and “original sequence” ordering of these images.
2. The contract is deployed with the provenance hash set as a constant.
3. When a token is sold after a certain timestamp has been reached, or the last token is sold, whichever comes first, the `startingIndexBlock` is set to the current block number.
4. In a later block, we set `startingIndex = blockhash(startingIndexBlock) % MAX_NFT_SUPPLY`.
5. Each token ID is assigned an image by the formula `(tokenId + startingIndex) % MAX_NFT_SUPPLY => Image Index From the Original Sequence`.

Assuming that `startingIndex` cannot be manipulated, any token purchase made before the “reveal event” (step 3) is blind, in that the purchaser has no control over which image they receive. To manipulate `startingIndex` to their benefit, an attacker would need to:

1. Have prior knowledge of the exact NFT images being sold.
2. Manipulate the block hash of the block containing the call to `mintNFT()` that fixes `startingIndexBlock` (step 3 above).

**Why are two separate txes needed to set the random index?** There is an important difference between the method used here and the more naive method of referencing `blockhash(block.number - 1)` as a source of randomness. The naive method is vulnerable to relatively simple attacks which make attempted mints while reverting if the attacker does not like the random number that was generated (see discussion of dark pools below). In contrast, using the two-step process requires an attacker to have significant mining resources of their own, and to actually withhold blocks in order to manipulate the result. This makes the attack extremely expensive.

### Seed generation

For Floot, we adapt the Hashmasks model described above with the following changes:

* Use an additional `guardianSeed` component. This ensures that, like Hashmasks, Floot cannot be attacked by miners operating on their own. Rather, attacking Floot is impossible without collusion between the guardian and miners.
* Change `startingIndexBlock = block.number` to `startingIndexBlock = block.number + 1`. Using the next block instead of the current block is a simple change which makes a miner attack significantly more difficult, since they must either:
  * Be willing to calculate and withhold a series of two blocks rather than one; or
  * Compute a malicious block hash in the single block window of time (e.g. 13 seconds) after someone else fixes the `startingIndexBlock`.

The addition of a guardian only strengthens the security properties of the system. The ideal guardian is someone who has some interest/stake in the success of the initial token distribution.

Seed generation is handled by [`BlindDrop.sol`](./contracts/BlindDrop.sol) and proceeds as follows:

1. Prior to deploying the contract, the guardian generates a secret `guardianSeed` as a random 32-byte string.
2. When the smart contract is deployed, the keccak256 hash (i.e. commitment) of the guardian seed is set as an immutable value.
3. After a certain timestamp is reached, or the last token is sold, whichever comes first, we set `automaticSeedBlockNumber = block.number + 1`.
4. In a later block, we set `automaticSeed = blockhash(automaticSeedBlockNumber)`. This begins the “guardian window” in which the guardian should submit their pre-commited seed.
    * If the guardian submits their seed within the window, then we set `finalSeed = automaticSeed XOR guardianSeed`. The result is random if either `automaticSeed` or `guardianSeed` is random.
    * If the guardian fails to submit their seed within the specified window, then a `fallbackSeed` is computed using the same two-step method used to generate the `automaticSeed`. We then set `finalSeed = automaticSeed XOR fallbackSeed`.

The purpose of `fallbackSeed` is to ensure that there is no incentive for the guardian to withhold `guardianSeed`.

### Why not use VRF?

A VRF like [Chainlink's](https://docs.chain.link/docs/chainlink-vrf/) is generally a good idea, but I don't think the added cost per transaction is worth it here.

### Why not simply use `block.timestamp` / `block.basefee` / `blockhash(...)` / etc?

Some contracts use a “naive” source of randomness based on the block metadata. This can make it difficult or infeasible for an ordinary attacker to predict the random value produced *in a particular call* to the minting function.

However, since the outcome of a mint is observable on-chain, an attacker can wrap minting calls in a smart contract that reverts if a minted token does not have the desired rarity. By using dark pools (e.g. Flashbots) an attacker can reduce the cost of failed mint attempts, which may make this attack efficient in practice.

This vulnerability leaves us in a worse place than where we started, since it can create a skew in the rarity distribution of the series as a whole.

*(Thanks to `trestian` for contributing discussion on this topic.)*

## Parameters

Floot is deployed with the following constructor parameters:
* `guardianHash` - Hash of the seed held by the guardian as one of the inputs to randomness.
* `guardianWindowDurationSeconds` - Period of time after the distribution, during which the guardian should provide their seed.
* `maxDistributionDurationSeconds` - Period of time after deployment after which the distribution will end even if the max supply was not distributed.
* `maxSupply` - The maximum number of tokens that can ever be minted.

## Previous work

* [Masks.sol](https://etherscan.io/address/0xc2c747e0f7004f9e8817db2ca4997657a7746928#code#F7#L1) by [HashMasks](https://www.thehashmasks.com/)
* [ERC721FairDistribution.sol](https://etherscan.io/address/0xb5d0b808022a501ab25e5db08cf03e747f0551f2#code#F2#L1) by [Chunky Cow Club Tour](https://twitter.com/ChunkyCowTour)
