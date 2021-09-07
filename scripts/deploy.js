const hre = require("hardhat");

async function main() {
  const FlootConstants = await hre.ethers.getContractFactory("FlootConstants");
  const constants = await FlootConstants.deploy();
  await constants.deployed();

  const Floot = await hre.ethers.getContractFactory("Floot", {
    libraries: {
      FlootConstants: constants.address,
    },
  });
  const floot = await Floot.deploy(
    "0x9ce720d21dd03123c0c2199e0c5433d01c7ac64ab729b1ec57de813014cce8bf",
    24 * 60 * 60, // guardianWindowDurationSeconds = 1 day
    24 * 60 * 60 * 10, // maxDistributionDurationSeconds = 10 days
    8000 // maxSupply
  );
  await floot.deployed();
  console.log(`Floot deployed to: ${floot.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
