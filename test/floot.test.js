const fs = require("fs");

const { expect } = require("chai");
const { ethers } = require("hardhat");
const Web3 = require("web3");

const GUARDIAN_TEST_SEED = Web3.utils.soliditySha3("test-seed");
const TOKEN_URI_PREFIX = "data:application/json;base64,";
const SVG_PREFIX = "data:image/svg+xml;base64,";

describe("Floot basic test", function () {
  it("Should mint the max supply and then start rendering bags as SVGs", async function () {
    const [deployer, otherSigner] = await ethers.getSigners();

    // Deployment.
    const FlootConstants = await ethers.getContractFactory("FlootConstants");
    const flootConstants = await FlootConstants.deploy();
    const Floot = await ethers.getContractFactory("Floot", {
      libraries: {
        FlootConstants: flootConstants.address,
      },
    });
    const floot = await Floot.deploy(
      Web3.utils.soliditySha3(GUARDIAN_TEST_SEED),
      24 * 60 * 60, // guardianWindowDurationSeconds = 1 day
      24 * 60 * 60 * 10, // maxDistributionDurationSeconds = 10 days
      3 // maxSupply
    );
    await floot.deployed();

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

    // Cannot claim any more.
    await expect(floot.claim()).to.be.revertedWith("Max supply exceeded");

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
    await ethers.provider.send("evm_mine", []);
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
});
