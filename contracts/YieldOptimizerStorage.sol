// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./interfaces/IUniswapV2Router.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IWeightedPool.sol";
// import "./lib/Errors.sol";
import "./YieldOptimizerStorage.sol";

contract YieldOptimizerStorage {
    IUniswapV2Router public swapRouter;
    IVault.FundManagement private funds;
    IVault.SwapKind private swapKind;
    Allocations public defaultAllocations;

    struct Allocations {
        uint256 reinvestedPercent;
        uint256 rewardsPercent;
        uint256 treasuryPercent;
        uint256 commisionsPercent;
    }

    struct Pool {
        address bptToken; // pool address
        address depositToken; // Pool token to be used for deposit.
        address exitToken; // Pool token to be used for withdraw.
        address[] tokens; // Array of pool tokens
        bytes32 poolId; // ID of the pool
        bytes32 swapRouteForDepositToken; // ID of the pool through which we can get the deposit token
        bytes32 swapRouteForExitToken; // ID of the pool through which we can get the withdraw token
        bytes32[] swapRoutes; // Array of pool id`s for the swap deposit or exit tokens to pool tokens
        uint256[] tokensWeights; // tokens weights in pool
        uint256 exitTokenIndex; // exit token index in the pool tokens array
        uint256 currentEpoch;
        string poolName; // pool name
        bool isActive; // If true the pull works, if false then not
        bool isDepositInOneToken; // if true the deposits makes in one token, if false then in all pool tokens
        bool isExitInOneToken; // if true the withdrawals makes in one token, if false then in all pool tokens
        bool isDefaultAllocations;
        Allocations allocations;
    }

    struct Epoch {
        uint256 commisions;
        uint256 jukuRewards;
        uint256 reinvestedBpt;
        uint256 treasuryRevenue;
        uint256 start;
        uint256 end;
    }

    uint256 constant PRECISSION = 10000;
    address public usdcToken; // USDC token
    address public jukuToken; // Juku token address
    address public adminWallet; // contract adminWallet address
    address public vault; // Beethoven X vault address
    address[] public pathToJuku; // SwapRoute to Juku token
    // uint256 public reinvestedDefault;
    // uint256 public rewardsDefault;
    // uint256 public treasuryDefault;
    // uint256 public commisionsDefault;
    mapping(address => Pool) public poolInfo; // Info about pool. See Pool struct.
    mapping(address => mapping(uint256 => Epoch)) public poolRewards;
    mapping(address => uint256) public rewardsEpochCounter;

    //======================================================= Events ========================================================

    ////@notice emitted while tokens are withdrawn from the contract
    event Withdraw(
        address indexed token,
        uint256 indexed amount,
        address indexed user,
        string userId
    );
    ////@notice emitted when the adminWallet is changed
    event UpdateAdminWallet(address newAdmin);
    ////@notice emitted when the funds are invested in the pool
    event Invest(
        bytes32 poolId,
        address indexed pool,
        uint256 indexed amountUsdc,
        uint256 indexed bptAmount,
        address user,
        string userId
    );
    ////@notice emitted when funds are withdrawn from the pool
    event WithdrawFromPool(
        bytes32 poolId,
        address indexed pool,
        uint256 indexed amountUsdc,
        uint256 indexed bptAmount,
        address user,
        string userId
    );
    event Harvest(
        address pool,
        bytes32 poolId,
        uint256 reinvestBptAmount,
        uint256 commisionsUsdcAmount,
        uint256 treasuryUsdcAmount,
        uint256 rewardsJukuAmount,
        uint256 timestamp
    );
    ////@notice emitted when a new pull is added
    event AddPool(
        address pool,
        bytes32 poolId,
        address[] poolTokens,
        uint256[] poolTokensWeights
    );
    ////@notice emitted when the pool exit token index is changed
    event UpdatePoolExitTokenIndex(address pool, uint256 exitTokenIndex);
    ////@notice emitted when the pool deposit type is updated
    event UpdatePoolDepositType(address pool, bool depositType);
    ////@notice emitted when the pool exit type is updated
    event UpdatePoolExitType(address pool, bool exitType);
    ////@notice emitted when the pool swap routes for pool tokens is changed
    event UpdatePoolSwapRoutes(address pool, bytes32[] swapRoutes);
    ////@notice emitted when the pool deposit token and swap route for deposit token is changed
    event UpdateDepositTokenSettings(
        address pool,
        bytes32 newSwapRoute,
        address newDepositToken
    );
    ////@notice emitted when the pool exit token, exit token index and swap route for exit token is changed
    event UpdateExitTokenSettings(
        address pool,
        bytes32 newSwapRoute,
        address newExitToken,
        uint256 exitTokenIndex
    );
    event UpdateAllocation(
        address pool,
        uint256 reinvest,
        uint256 commisions,
        uint256 rewards,
        uint256 treasury
    );
    event UpdateDefaultAllocation(
        uint256 reinvest,
        uint256 commisions,
        uint256 rewards,
        uint256 treasury
    );
    event UpdateSwapRouter(address newSwapRouter);
    event UpdatePathToJuku(address[] newPath);
    event TogglePoolActivity(address pool, bool isActive);
    event UpdatePoolAllocationType(address pool, bool isDefault);
}
