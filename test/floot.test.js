const crypto = require('crypto');
const fs = require("fs");

const { BigNumber } = require("@ethersproject/bignumber");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const Web3 = require("web3");

const GUARDIAN_TEST_SEED = Web3.utils.soliditySha3(
  `test-seed-${crypto.randomBytes(24).toString("base64")}`
);
const TOKEN_URI_PREFIX = "data:application/json;base64,";
const SVG_PREFIX = "data:image/svg+xml;base64,";
const ERC721_INTERFACE_ID = BigNumber.from(0x80ac58cd);

// Constructor parameters.
const GUARDIAN_WINDOW_DURATION_S = 24 * 60 * 60; // 1 day
const MAX_DISTRIBUTION_DURATION_S = 24 * 60 * 60 * 10; // 10 days
const MAX_SUPPLY = 3;

describe("Floot tests", function () {
  let snapshot;
  let deployer;
  let otherSigner;
  let floot;

  before(async () => {
    [deployer, otherSigner] = await ethers.getSigners();

    // Deployment.
    const FlootConstants = await ethers.getContractFactory("FlootConstants");
    const flootConstants = await FlootConstants.deploy();
    const Floot = await ethers.getContractFactory("Floot", {
      libraries: {
        FlootConstants: flootConstants.address,
      },
    });
    floot = await Floot.deploy(
      Web3.utils.soliditySha3(GUARDIAN_TEST_SEED),
      GUARDIAN_WINDOW_DURATION_S, // guardianWindowDurationSeconds = 1 day
      MAX_DISTRIBUTION_DURATION_S,
      MAX_SUPPLY
    );
    await floot.deployed();
  });

  afterEach(async () => {
    // Load snapshot and re-save.
    await ethers.provider.send("evm_revert", [snapshot]);
    snapshot = await ethers.provider.send("evm_snapshot", []);
  });

  describe("Before any minting", () => {
    before(async () => {
      // Save snapshot.
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    it("Should mint the max supply and then start rendering bags as SVGs", async function () {
      // Claim tokens.
      const claim1 = await floot.claim();
      const receipt1 = await claim1.wait();
      console.log("First mint gas used:", receipt1.gasUsed.toString());
      const claim2 = await floot.connect(otherSigner).claim();
      const receipt2 = await claim2.wait();
      console.log("Second mint gas used:", receipt2.gasUsed.toString());
      const claim3 = await floot.connect(otherSigner).claim();
      const receipt3 = await claim3.wait();
      console.log("Third mint gas used:", receipt3.gasUsed.toString());

      // Cannot generate SVGs or metadata until seed is finalized.
      await expect(floot.getWeapon(1)).to.be.revertedWith("Final seed not set");
      await expect(floot.tokenURI(1)).to.be.revertedWith("Final seed not set");

      // Check owners.
      await expect(floot.ownerOf(0)).to.be.revertedWith(
        "ERC721: owner query for nonexistent token"
      );
      expect(await floot.ownerOf(1)).to.equal(deployer.address);
      expect(await floot.ownerOf(2)).to.equal(otherSigner.address);
      expect(await floot.ownerOf(3)).to.equal(otherSigner.address);
      await expect(floot.ownerOf(4)).to.be.revertedWith(
        "ERC721: owner query for nonexistent token"
      );

      // Finalize random seed.
      await floot.setAutomaticSeedBlockNumber();
      await ethers.provider.send("evm_mine", []); // Must wait an extra block.
      await floot.setAutomaticSeed();
      await floot.setGuardianSeed(GUARDIAN_TEST_SEED);
      await floot.setFinalSeed();

      // Check generated metadata.
      const uri = await floot.tokenURI(1);
      const jsonBase64 = uri.slice(TOKEN_URI_PREFIX.length);
      const json = Buffer.from(jsonBase64, "base64").toString();
      const metadata = JSON.parse(json);
      console.log(metadata);

      // Check SVG.
      const imageValue = metadata.image;
      const imageBase64 = imageValue.slice(SVG_PREFIX.length);
      const svg = Buffer.from(imageBase64, "base64").toString();

      fs.writeFileSync("./test/test.svg", svg);
    });

    it("Supports ERC721Enumerable interface", async () => {
      // Check supportsInterface().
      // eslint-disable-next-line no-unused-expressions
      expect(await floot.supportsInterface(ERC721_INTERFACE_ID)).to.be.true;

      expect(await floot.totalSupply()).to.equal(0);
      await floot.claim();
      expect(await floot.totalSupply()).to.equal(1);
      await floot.connect(otherSigner).claim();
      expect(await floot.totalSupply()).to.equal(2);
      await floot.connect(otherSigner).claim();
      expect(await floot.totalSupply()).to.equal(3);

      // Get token by index.
      expect(await floot.tokenByIndex(0)).to.equal(1);
      expect(await floot.tokenByIndex(1)).to.equal(2);
      expect(await floot.tokenByIndex(2)).to.equal(3);

      // Get balance of owner and token of owner by index.
      expect(await floot.balanceOf(deployer.address)).to.equal(1);
      expect(await floot.tokenOfOwnerByIndex(deployer.address, 0)).to.equal(1);
      expect(await floot.balanceOf(otherSigner.address)).to.equal(2);
      expect(await floot.tokenOfOwnerByIndex(otherSigner.address, 0)).to.equal(
        2
      );
      expect(await floot.tokenOfOwnerByIndex(otherSigner.address, 1)).to.equal(
        3
      );

      // Check behavior of transfers.
      await floot
        .connect(otherSigner)
        .transferFrom(otherSigner.address, deployer.address, 2);
      expect(await floot.balanceOf(deployer.address)).to.equal(2);
      expect(await floot.balanceOf(otherSigner.address)).to.equal(1);
      expect(await floot.tokenOfOwnerByIndex(otherSigner.address, 0)).to.equal(
        3
      );
    });

    it("Cannot set automatic seed block number", async () => {
      await expect(floot.setAutomaticSeedBlockNumber()).to.be.revertedWith(
        "Distribution not over"
      );
    });

    it("Cannot set automatic seed", async () => {
      await expect(floot.setAutomaticSeed()).to.be.revertedWith(
        "Block number not set"
      );
    });

    it("Cannot set guardian seed", async () => {
      await expect(
        floot.setGuardianSeed(GUARDIAN_TEST_SEED)
      ).to.be.revertedWith("Automatic seed not set");
    });

    it("Cannot set fallback seed block number", async () => {
      await expect(floot.setFallbackSeedBlockNumber()).to.be.revertedWith(
        "Automatic seed not set"
      );
    });

    it("Cannot set fallback seed", async () => {
      await expect(floot.setFallbackSeed()).to.be.revertedWith(
        "Block number not set"
      );
    });

    it("Cannot set final seed", async () => {
      await expect(floot.setFinalSeed()).to.be.revertedWith(
        "Guardian/fallback seed not set"
      );
    });
  });

  describe("After the distribution auto-end", () => {
    let originalSnapshot;

    before(async () => {
      originalSnapshot = await ethers.provider.send("evm_snapshot", []);

      // Claim one.
      await floot.claim();

      // Elapse time.
      await ethers.provider.send("evm_increaseTime", [
        MAX_DISTRIBUTION_DURATION_S,
      ]);

      // Save snapshot.
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    after(async () => {
      await ethers.provider.send("evm_revert", [originalSnapshot]);
    });

    it("Cannot claim any more", async () => {
      await expect(floot.claim()).to.be.revertedWith("Distribution has ended");
    });

    it("Can set automatic seed block number, exactly once", async () => {
      await floot.setAutomaticSeedBlockNumber();
      await expect(floot.setAutomaticSeedBlockNumber()).to.be.revertedWith(
        "Seed block number already set"
      );
    });
  });

  describe("After the max supply has been minted", () => {
    let originalSnapshot;

    before(async () => {
      originalSnapshot = await ethers.provider.send("evm_snapshot", []);

      for (let i = 0; i < 3; i++) {
        await floot.claim();
      }

      // Save snapshot.
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    after(async () => {
      await ethers.provider.send("evm_revert", [originalSnapshot]);
    });

    it("Cannot mint any more", async () => {
      await expect(floot.claim()).to.be.revertedWith("Max supply exceeded");
    });

    it("Cannot set guardian seed", async () => {
      await expect(
        floot.setGuardianSeed(GUARDIAN_TEST_SEED)
      ).to.be.revertedWith("Automatic seed not set");
    });

    it("Cannot set final seed", async () => {
      await expect(floot.setFinalSeed()).to.be.revertedWith(
        "Guardian/fallback seed not set"
      );
    });

    it("Blind drop flow, including failure cases...", async () => {
      // Can set automatic seed block number exactly once.
      await floot.setAutomaticSeedBlockNumber();

      // Setting seed block fails if there isn't a block minted since setting the block number.
      await expect(floot.setAutomaticSeed()).to.be.revertedWith(
        "Block number not mined"
      );

      // Can't set automatic seed block a second time.
      await expect(floot.setAutomaticSeedBlockNumber()).to.be.revertedWith(
        "Seed block number already set"
      );

      // Can set automatic seed exactly once.
      const tx = await floot.setAutomaticSeed();
      await expect(floot.setAutomaticSeed()).to.be.revertedWith(
        "Automatic seed already set"
      );

      // Record the automatic seed.
      const receipt = await tx.wait();
      const setAutomaticSeedLog = floot.interface.parseLog(receipt.logs[0]);
      const automaticSeed = setAutomaticSeedLog.args.seed;

      // Cannot set fallback seed during the guardian window.
      await expect(floot.setFallbackSeedBlockNumber()).to.be.revertedWith(
        "Guardian window has not ended"
      );

      // Can't set final seed until guardian (or fallback) seed is set.
      await expect(floot.setFinalSeed()).to.be.revertedWith(
        "Guardian/fallback seed not set"
      );

      // Cannot set guardian seed that does not match committed hash.
      const badSeed = Web3.utils.soliditySha3("bad-seed");
      await expect(floot.setGuardianSeed(badSeed)).to.be.revertedWith(
        "Guardian seed invalid"
      );

      // Can set guardian seed exactly once. (This prevents emitting misleading logs.)
      await floot.setGuardianSeed(GUARDIAN_TEST_SEED);
      await expect(
        floot.setGuardianSeed(GUARDIAN_TEST_SEED)
      ).to.be.revertedWith("Seed already set");

      // Can set fallback seed block number even if guardian seed was set.
      await ethers.provider.send("evm_increaseTime", [
        GUARDIAN_WINDOW_DURATION_S,
      ]);
      await floot.setFallbackSeedBlockNumber();

      // Cannot set fallback seed if guardian seed was set.
      await expect(floot.setFallbackSeed()).to.be.revertedWith(
        "Seed already set"
      );

      // Cannot get the final seed before it is set.
      await expect(floot.getFinalSeed()).to.be.revertedWith(
        "Final seed not set"
      );

      // Can set the final seed exactly once.
      await floot.setFinalSeed();
      await expect(floot.setFinalSeed()).to.be.revertedWith(
        "Final seed already set"
      );

      // Get the final seed.
      const finalSeed = await floot.getFinalSeed();
      const automaticSeedBn = BigNumber.from(automaticSeed);
      const guardianSeedBn = BigNumber.from(GUARDIAN_TEST_SEED);
      const finalSeedBn = BigNumber.from(finalSeed);
      expect(finalSeedBn).to.equal(automaticSeedBn.xor(guardianSeedBn));
    });

    it("Blind drop fallback flow, if guardian window elapses", async () => {
      // Set automatic seed.
      await floot.setAutomaticSeedBlockNumber();
      await ethers.provider.send("evm_mine", []); // Must wait an extra block.
      const tx = await floot.setAutomaticSeed();

      // Record the automatic seed.
      const receipt = await tx.wait();
      const setAutomaticSeedLog = floot.interface.parseLog(receipt.logs[0]);
      const automaticSeed = setAutomaticSeedLog.args.seed;

      // Elapse guardian window and set fallback seed.
      await ethers.provider.send("evm_increaseTime", [
        GUARDIAN_WINDOW_DURATION_S,
      ]);
      await expect(
        floot.setGuardianSeed(GUARDIAN_TEST_SEED)
      ).to.be.revertedWith("Guardian window elapsed");
      await floot.setFallbackSeedBlockNumber();
      await expect(floot.setFallbackSeedBlockNumber()).to.be.revertedWith(
        "Seed block number already set"
      );
      const tx2 = await floot.setFallbackSeed();
      await expect(floot.setFallbackSeed()).to.be.revertedWith(
        "Seed already set"
      );

      // Record the fallback seed.
      const receipt2 = await tx2.wait();
      const setFallbackSeedLog = floot.interface.parseLog(receipt2.logs[0]);
      const fallbackSeed = setFallbackSeedLog.args.seed;

      // Set the final seed.
      floot.getFinalSeed();

      // Can set the final seed exactly once.
      await floot.setFinalSeed();
      await expect(floot.setFinalSeed()).to.be.revertedWith(
        "Final seed already set"
      );

      // Get the final seed.
      const finalSeed = await floot.getFinalSeed();
      const automaticSeedBn = BigNumber.from(automaticSeed);
      const fallbackSeedBn = BigNumber.from(fallbackSeed);
      const finalSeedBn = BigNumber.from(finalSeed);
      expect(finalSeedBn).to.equal(automaticSeedBn.xor(fallbackSeedBn));
    });
  });
});
