// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import { BlindDrop } from "./BlindDrop.sol";
import { FlootMetadata } from "./FlootMetadata.sol";

/**
 * @title Floot
 * @author the-torn
 *
 * @notice Floot = Fair Loot. Like Loot, but enforces a fair, random distribution.
 *
 *  Documentation: https://github.com/the-torn/floot/blob/main/README.md
 *
 *  Note: Deliberately choosing not to use ReentrancyGuard.
 */
contract Floot is
  FlootMetadata
{
  uint256 public immutable MAX_SUPPLY;
  uint256 public immutable MAX_DISTRIBUTION_DURATION_SECONDS;

  uint256 internal _totalSupply = 0;

  constructor(
    bytes32 guardianHash,
    uint256 guardianWindowDurationSeconds,
    uint256 maxDistributionDurationSeconds,
    uint256 maxSupply
  )
    ERC721("Floot", "FLOOT")
    BlindDrop(guardianHash, guardianWindowDurationSeconds, maxDistributionDurationSeconds)
  {
    MAX_SUPPLY = maxSupply;
    MAX_DISTRIBUTION_DURATION_SECONDS = maxDistributionDurationSeconds;
  }

  /**
   * @notice Claim a token.
   */
  function claim()
    external
  {
    uint256 startingTotalSupply = _totalSupply;
    require(
      startingTotalSupply < MAX_SUPPLY,
      "Max supply exceeded"
    );
    require(
      block.timestamp < DISTRIBUTION_AUTO_END_TIMESTAMP,
      "Distribution has ended"
    );

    // Issue tokens with IDs 1 through MAX_SUPPLY, inclusive.
    uint256 tokenId = startingTotalSupply + 1;

    // Note: Deliberately choosing not to use _safeMint().
    _mint(msg.sender, tokenId);
    _totalSupply = tokenId;
  }

  function setAutomaticSeedBlockNumber()
    external
  {
    _setAutomaticSeedBlockNumber(_totalSupply == MAX_SUPPLY);
  }

  function totalSupply()
    external
    view
    returns (uint256)
  {
    return _totalSupply;
  }
}
