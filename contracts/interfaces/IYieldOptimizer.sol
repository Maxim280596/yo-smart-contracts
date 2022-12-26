pragma solidity 0.8.17;

interface IYieldOptimizer {
    function replenishStaking(address token, uint256 amount) external;
}
