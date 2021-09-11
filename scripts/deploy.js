const hre = require("hardhat");

/**
 * @notice The hash commitment of the guardian seed.
 *
 *  IMPORTANT: Must be a new value for every smart contract deployment / every token distribution.
 *
 *  IMPORTANT: Cannot be updated after deployment.
 *
 *  This is a commitment to the bytes32 seed that will be posted by the guardian after the end of
 *  the distribution, as one of the inputs to the final seed.
 *
 *  See README.md for instructions on how to generate a seed before deployment.
 */
const GUARDIAN_SEED_HASH = "TODO"; // IMPORTANT: Generate a unique seed per deployment.

/**
 * @notice Determines how long the guardian has to provide their seed, after the distribution end.
 *
 *  IMPORTANT: Cannot be updated after deployment.
 *
 *  This value should not be too large, otherwise, if the guardian does not provide their seed,
 *  users will be stuck without metadata for their tokens.
 */
const GUARDIAN_WINDOW_DURATION_SECONDS = 24 * 60 * 60; // 1 day

/**
 * @notice Determines the time after deployment at which minting will automatically end, regardless of
 *  whether the max supply was minted.
 *
 *  IMPORTANT: Cannot be updated after deployment.
 *
 *  When the max distribution duration has elapsed, minting will end and the tokens can be revealed.
 *  Remember that the guardian should be online at the distribution end to provide their seed.
 *  If the guardian fails to provide their seed, the fallback seed can be set instead.
 *
 *  This value should not be too large, otherwise if the max supply is not reached, users will be
 *  stuck without metadata for their tokens.
 */
const MAX_DISTRIBUTION_DURATION_SECONDS = 24 * 60 * 60 * 10; // 10 days

/**
 * @notice The maximum number of tokens that can be minted.
 *
 *  IMPORTANT: Cannot be updated after deployment.
 *
 *  The distribution will end when either this number of tokens were minted, OR the distribution
 *  duration has elapsed, whichever comes first.
 */
const MAX_SUPPLY = 8000; // Same supply as original Loot.

/**
 * @notice Deploys the Floot contract using the constructor parameters defined above.
 */
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
    GUARDIAN_SEED_HASH,
    GUARDIAN_WINDOW_DURATION_SECONDS, // guardianWindowDurationSeconds = 1 day
    MAX_DISTRIBUTION_DURATION_SECONDS,
    MAX_SUPPLY // maxSupply
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
