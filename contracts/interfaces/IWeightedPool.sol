// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

interface IWeightedPool {
    function getNormalizedWeights() external view returns (uint256[] memory);

    function name() external view returns (string memory);
}
