// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "./interfaces/IUniswapV2Router.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IWeightedPool.sol";
import "./interfaces/IYieldOptimizerStaking.sol";
import "./lib/Errors.sol";

contract YieldOptimizer is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    IVault.FundManagement private funds;
    Allocations public defaultAllocations;

    struct Allocations {
        uint256 reinvestedPercent; // The percentage of rewards that will be reinvested
        uint256 rewardsPercent; // A percentage of the rewards that will be exchanged for Juku token and paid to the user
        uint256 treasuryPercent; // A percentage of the rewards that will be exchanged for USDC token and sent to the treasury
        uint256 commisionsPercent; // A percentage of the rewards that will be used as a project commission
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
        bool isActive; // If true the pull works, if false then not
        bool isDepositInOneToken; // if true the deposits makes in one token, if false then in all pool tokens
        bool isExitInOneToken; // if true the withdrawals makes in one token, if false then in all pool tokens
        bool isDefaultAllocations; // If true, then the default distribution will be used, if false - individual
        Allocations allocations; // Individual distribution of rewards for the pool
    }

    struct Epoch {
        uint256 commisions; // Amount of collected commissions in USDC token per epoch
        uint256 jukuRewards; // Amount of collected rewards in Juku token per epoch
        uint256 reinvestedBpt; // The amount of reinvested BPT tokens per epoch
        uint256 treasuryRevenue; // Amount of collected treasury revenue in USDC token per epoch
        uint256 start; // epoch start timestamp
        uint256 end; // epoch end timestamp
    }

    uint256 private constant PRECISSION = 10000; // PRECISSION for math operation
    address public usdcToken; // USDC token
    address public jukuToken; // Juku token address
    address public adminWallet; // contract adminWallet address
    address public vault; // Beethoven X vault address
    address public swapRouter; // swap router address
    address public revenueRecipient; // treasury revenue recipient
    address public staking; // staking USDX/JUKU address
    address[] public pathToJuku; // SwapRoute to Juku token
    mapping(address => Pool) public poolInfo; // Info about pool. See Pool struct.
    mapping(address => mapping(uint256 => Epoch)) public poolRewards; // information about the distribution of rewards in the epoch
    mapping(address => uint256) public rewardsEpochCounter; // a counter of the number of epochs for a particular pool

    //======================================================= Events ========================================================

    // @notice emitted while tokens are withdrawn from the contract
    event Withdraw(
        address indexed token,
        uint256 indexed amount,
        address indexed user,
        string userId
    );
    // @notice emitted when the adminWallet is changed
    event UpdateAdminWallet(address newAdmin);
    // @notice emitted when the funds are invested in the pool
    event Invest(
        bytes32 poolId,
        address indexed pool,
        uint256 indexed amountUsdc,
        uint256 indexed bptAmount,
        address user,
        string userId
    );
    // @notice emitted when funds are withdrawn from the pool
    event WithdrawFromPool(
        bytes32 poolId,
        address indexed pool,
        uint256 indexed amountUsdc,
        uint256 indexed bptAmount,
        address user,
        string userId
    );
    // @notice emitted when the rewards are distributed for the epoch
    event Harvest(
        address pool,
        bytes32 poolId,
        uint256 reinvestBptAmount,
        uint256 commisionsUsdcAmount,
        uint256 treasuryUsdcAmount,
        uint256 rewardsJukuAmount,
        uint256 timestamp
    );
    // @notice emitted when a new pull is added
    event AddPool(
        address pool,
        bytes32 poolId,
        address[] poolTokens,
        uint256[] poolTokensWeights
    );
    // @notice emitted when the pool exit token index is changed
    event UpdatePoolExitTokenIndex(address pool, uint256 exitTokenIndex);
    // @notice emitted when the pool deposit type is updated
    event UpdatePoolDepositType(address pool, bool depositType);
    // @notice emitted when the pool exit type is updated
    event UpdatePoolExitType(address pool, bool exitType);
    // @notice emitted when the pool swap routes for pool tokens is changed
    event UpdatePoolSwapRoutes(address pool, bytes32[] swapRoutes);
    // @notice emitted when the pool deposit token and swap route for deposit token is changed
    event UpdateDepositTokenSettings(
        address pool,
        bytes32 newSwapRoute,
        address newDepositToken
    );
    // @notice emitted when the pool exit token, exit token index and swap route for exit token is changed
    event UpdateExitTokenSettings(
        address pool,
        bytes32 newSwapRoute,
        address newExitToken,
        uint256 exitTokenIndex
    );
    // @notice emitted when setting up the individual reward distribution for the pool
    event UpdateAllocation(
        address pool,
        uint256 reinvest,
        uint256 commisions,
        uint256 rewards,
        uint256 treasury
    );
    // @notice emitted when setting up the default reward distribution
    event UpdateDefaultAllocation(
        uint256 reinvest,
        uint256 commisions,
        uint256 rewards,
        uint256 treasury
    );
    // @notice emitted when the pool activity changes
    event TogglePoolActivity(address pool, bool isActive);
    // @notice emitted when the pool allocation type is changed
    event UpdatePoolAllocationType(address pool, bool isDefault);
    // @notice emitted when the revenue recipient address is changed
    event UpdateRevenueRecipient(address newRecipient);
    // @notice emitted when the when called emergencyWithdraw
    event EmergencyWithdraw(address token, uint256 amount, address recipient);
    // @notice emitted when the when called replenishStaking
    event ReplenishStaking(address token, uint256 amount, address staking);
    // @notice emitted when the staking address setted or updated
    event SetStaking(address newStaking);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
    @dev The function plays the role of a constructor and initializes all the variables needed to start the contract.
    @param _usdcToken USDC token address
    @param _jukuToken Juku token address
    @param _admin admin address
    @param _vault Beethoven X Vault address
    @param _uniRouter spookySwap router address
    @param _revenueRecipient treasury revenue recipient
    @param _reinvestedPercent default reinvested percent. This argument is separated from the rest of the distribution. Must be from 0 - 10000.
    @param _rewardsPercent default rewards percent
    @param _treasuryPercent default treasury revenue percent
    @param _commisionsPercent default commisions percent.
    _rewardsPercent + _treasuryPercent + _commisionsPercent should be equal 10000.
    */
    function initialize(
        address _usdcToken,
        address _jukuToken,
        address _admin,
        address _vault,
        address _uniRouter,
        address _revenueRecipient,
        uint256 _reinvestedPercent,
        uint256 _rewardsPercent,
        uint256 _treasuryPercent,
        uint256 _commisionsPercent
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __Pausable_init();
        _require(
            _vault != address(0) &&
                _admin != address(0) &&
                _usdcToken != address(0) &&
                _jukuToken != address(0) &&
                _uniRouter != address(0),
            Errors.ZERO_ADDRESS
        );
        _require(
            _commisionsPercent + _rewardsPercent + _treasuryPercent ==
                PRECISSION,
            Errors.INVALID_PERCENT
        );
        _require(_reinvestedPercent <= PRECISSION, Errors.PERCENT_ERROR);
        vault = _vault;
        usdcToken = _usdcToken;
        jukuToken = _jukuToken;
        swapRouter = _uniRouter;
        adminWallet = _admin;
        revenueRecipient = _revenueRecipient;
        pathToJuku = [_usdcToken, _jukuToken];
        funds = IVault.FundManagement(
            address(this),
            false,
            payable(address(this)),
            false
        );
        defaultAllocations = Allocations({
            reinvestedPercent: _reinvestedPercent,
            rewardsPercent: _rewardsPercent,
            treasuryPercent: _treasuryPercent,
            commisionsPercent: _commisionsPercent
        });
         _makeApprove(IERC20Upgradeable(_usdcToken), _vault);
         _makeApprove(IERC20Upgradeable(_usdcToken), _uniRouter);
         _makeApprove(IERC20Upgradeable(_jukuToken), _uniRouter);
    }

    receive() external payable {}

    //======================================================= Modifiers ========================================================

    /**
    @dev The modifier checks whether the caller of the method 
    is an admin or the owner of the contract.
    */
    modifier onlyAdmin() {
        _require(
            msg.sender == adminWallet || msg.sender == owner(),
            Errors.ACCESS_IS_DENIED
        );
        _;
    }
    /**
    @dev The modifier checks whether the caller of the method 
    is an staking Smart Contract.
    */
    modifier onlyStaking() {
        _require(
            msg.sender == staking || msg.sender == owner(),
            Errors.ACCESS_IS_DENIED
        );
        _;
    }

    /**
    @dev The modifier checks if the pool is currently active
    @param poolAddress pool address.
    */
    modifier isActive(address poolAddress) {
        Pool storage pool = poolInfo[poolAddress];
        _require(pool.isActive, Errors.NOT_ACTIVE);
        _;
    }

    /**
    @dev The modifier checks if the pool has already been added to the YO
    @param poolAddress pool address.
    */
    modifier isAdded(address poolAddress) {
        Pool storage pool = poolInfo[poolAddress];
        _require(pool.bptToken != address(0), Errors.POOL_NOT_ADDED);
        _;
    }

    //======================================================= External Functions ========================================================

    /**
    @dev External function for withdrawing tokens from the YO.
    Only the owner or admin can call.
    @param user user wallet address.
    @param amount CBI token amount.
    @param userId user ID in CBI system.
    */
    function withdraw(
        address token,
        uint256 amount,
        address user,
        string calldata userId
    ) external onlyAdmin whenNotPaused {
        _withdraw(token, amount, user);
        emit Withdraw(token, amount, user, userId);
    }

    /**
    @dev The function invests funds into the pool.
    Only the owner or admin can call.
    @param poolAddress pool address.
    @param amount deposited amount in usdc.
    @param user user address.
    @param userId user ID in YO system.
    */
    function invest(
        address poolAddress,
        uint256 amount,
        address user,
        string memory userId
    ) external onlyAdmin isActive(poolAddress) whenNotPaused {
        _require(
            IERC20Upgradeable(usdcToken).balanceOf(address(this)) >= amount,
            Errors.NOT_ENOUGH_TOKENS
        );
        Pool storage pool = poolInfo[poolAddress];

        uint256[] memory giveAmounts = pool.isDepositInOneToken
            ? _investInOneToken(pool, amount)
            : _investInAllTokens(pool, amount);

        uint256 bptBalanceBefore = IERC20Upgradeable(pool.bptToken).balanceOf(
            address(this)
        );
        _balancerJoin(pool.poolId, pool.tokens, giveAmounts);
        uint256 bptBalance = IERC20Upgradeable(pool.bptToken).balanceOf(
            address(this)
        ) - bptBalanceBefore;

        emit Invest(
            pool.poolId,
            pool.bptToken,
            amount,
            bptBalance,
            user,
            userId
        );
    }

    /**
    @dev The function withdraw funds from the pool.
    Only the owner or admin can call.
    @param poolAddress pool address.
    @param amount bpt token amount.
    @param user user address.
    @param userId user ID in YO system.
    */
    function withdrawFromPool(
        address poolAddress,
        uint256 amount,
        address user,
        string memory userId
    ) external onlyAdmin isActive(poolAddress) whenNotPaused {
        Pool storage pool = poolInfo[poolAddress];
        _require(
            IERC20Upgradeable(pool.bptToken).balanceOf(address(this)) >= amount,
            Errors.NOT_ENOUGH_TOKENS
        );
        uint256 usdcExitAmount = pool.isExitInOneToken
            ? _withdrawFromPoolInOneToken(pool, amount)
            : _withdrawFromPoolInAllTokens(pool, amount);

        emit WithdrawFromPool(
            pool.poolId,
            pool.bptToken,
            usdcExitAmount,
            amount,
            user,
            userId
        );
    }

    /**
    @dev The function adds and configures a new pool to the YO contract.
    Only the owner or admin can call.
    @param _poolId pool id.
    @param _poolAddress pool contract address
    @param _depositToken pool deposit token.
    @param _exitToken pool withdraw token.
     @param _swapRouteForDepositToken swap route for swap deposit token.
    @param _swapRouteForExitToken swap route for swap exit token.
    @param _exitTokenIndex exit token index in tokens array.
    @param _isDepositInOneToken boolean value if true the deposits makes in one token, if false then in all pool tokens  
    @param _isExitInOneToken boolean value if true the withdrawals makes in one token, if false then in all pool tokens
    */
    function addPool(
        bytes32 _poolId,
        address _poolAddress,
        address _depositToken,
        address _exitToken,
        bytes32 _swapRouteForDepositToken,
        bytes32 _swapRouteForExitToken,
        bytes32[] memory _swapRoutes,
        uint256 _exitTokenIndex,
        bool _isDepositInOneToken,
        bool _isExitInOneToken
    ) external onlyAdmin whenNotPaused {
        Pool storage pool = poolInfo[_poolAddress];
        _require(pool.bptToken == address(0), Errors.POOL_IS_ADDED);

        (address[] memory poolTokens, , ) = IVault(vault).getPoolTokens(
            _poolId
        );
        _require(
            _swapRoutes.length == poolTokens.length,
            Errors.INVALID_ARRAY_LENGHTS
        );

        pool.tokens = poolTokens;
        pool.poolId = _poolId;
        pool.tokensWeights = IWeightedPool(_poolAddress).getNormalizedWeights();
        pool.depositToken = _depositToken;
        pool.exitToken = _exitToken;
        pool.swapRouteForDepositToken = _swapRouteForDepositToken;
        pool.swapRouteForExitToken = _swapRouteForExitToken;
        pool.bptToken = _poolAddress;
        pool.swapRoutes = _swapRoutes;
        pool.isActive = true;
        pool.exitTokenIndex = _exitTokenIndex;
        pool.isDepositInOneToken = _isDepositInOneToken;
        pool.isExitInOneToken = _isExitInOneToken;
        pool.isDefaultAllocations = true;

        Epoch storage epoch = poolRewards[_poolAddress][
            rewardsEpochCounter[_poolAddress]
        ];
        epoch.start = block.timestamp;
        pool.currentEpoch = rewardsEpochCounter[_poolAddress];
         _makeApprove(IERC20Upgradeable(_poolAddress), vault);
        for (uint256 i = 0; i < poolTokens.length; i++) {
            _makeApprove(IERC20Upgradeable(poolTokens[i]), vault);
        }
        emit AddPool(
            pool.bptToken,
            pool.poolId,
            pool.tokens,
            pool.tokensWeights
        );
    }

    /**
    @dev The function collects the swap fee from a certain pool and distributes it according to the specified allocation. 
    The number of bpt tokens that will be burned is calculated on the backend.
    Only the owner or admin can call.
    @param poolAddress pool contract address
    @param amount bpt tokens amount
    */
    function harvest(address poolAddress, uint256 amount)
        external
        onlyAdmin
        isActive(poolAddress)
        whenNotPaused
    {
        Pool storage pool = poolInfo[poolAddress];
        _require(
            IERC20Upgradeable(pool.bptToken).balanceOf(address(this)) >= amount,
            Errors.NOT_ENOUGH_TOKENS
        );

        (uint256 reinvest, uint256 totalWithdrawAmount) = _calcHarvestAmount(
            poolAddress,
            amount
        );

        uint256 usdcExitAmount = pool.isExitInOneToken
            ? _withdrawFromPoolInOneToken(pool, totalWithdrawAmount)
            : _withdrawFromPoolInAllTokens(pool, totalWithdrawAmount);

        (uint256 commisions, uint256 rewards, uint256 treasury) = _allocate(
            poolAddress,
            usdcExitAmount
        );

        uint256[] memory amounts = IUniswapV2Router(swapRouter)
            .swapExactTokensForTokens(
                rewards,
                0,
                pathToJuku,
                address(this),
                block.timestamp
            );

        Epoch storage epoch = poolRewards[poolAddress][pool.currentEpoch];
        epoch.commisions = commisions;
        epoch.jukuRewards = amounts[1];
        epoch.treasuryRevenue = treasury;
        epoch.reinvestedBpt = reinvest;
        epoch.end = block.timestamp;

        ++rewardsEpochCounter[poolAddress];
        pool.currentEpoch = rewardsEpochCounter[poolAddress];
        Epoch storage newEpoch = poolRewards[poolAddress][pool.currentEpoch];
        newEpoch.start = block.timestamp;
        IERC20Upgradeable(usdcToken).safeTransfer(revenueRecipient, treasury);

        emit Harvest(
            poolAddress,
            pool.poolId,
            reinvest,
            commisions,
            treasury,
            amounts[1],
            block.timestamp
        );
    }

    /**
    @dev The function replenishes the setting contract. 
    The staking contract before each invest, withdraw and harvest calls it
    Only the staking smart contract can call.
    @param token replenish token address
    @param amount replenish token amount
    */
    function replenishStaking(address token, uint256 amount)
        external
        onlyStaking
        whenNotPaused
    {
        _withdraw(token, amount, staking);
        emit ReplenishStaking(token, amount, staking);
    }

    /**
    @dev The function updates the address of the staking smart contract
    Only the owner or admin can call.
    @param newStaking new staking address
    */
    function setStaking(address newStaking) external onlyAdmin {
        staking = newStaking;
        emit SetStaking(newStaking);
    }

    /**
    @dev The function updates the address that will receive platform revenue.
    Only the owner or admin can call.
    @param newRecipient address of revenue recipient
    */
    function updateRevenueRecipient(address newRecipient)
        external
        onlyOwner
        whenNotPaused
    {
        revenueRecipient = newRecipient;
        emit UpdateRevenueRecipient(newRecipient);
    }

    /**
    @dev The function configures the individual distribution of rewards for the pool. 
    reinvest must be between 0 and 10000, it was separated from other percentages for gas optimization.
    commissions + rewards + treasury should be equal to 10000(PRECISSION).
    Only the owner or admin can call.
    @param poolAddress pool contract address
    @param reinvest reinvest percent
    @param commisions commissions percent
    @param rewards rewards percent
    @param treasury treasury percent
    */
    function updatePoolAllocationPercents(
        address poolAddress,
        uint256 reinvest,
        uint256 commisions,
        uint256 rewards,
        uint256 treasury
    ) external onlyAdmin isAdded(poolAddress) whenNotPaused {
        _require(
            commisions + rewards + treasury == PRECISSION,
            Errors.INVALID_PERCENT
        );
        _require(reinvest <= PRECISSION, Errors.PERCENT_ERROR);
        Pool storage pool = poolInfo[poolAddress];
        pool.allocations.reinvestedPercent = reinvest;
        pool.allocations.commisionsPercent = commisions;
        pool.allocations.rewardsPercent = rewards;
        pool.allocations.treasuryPercent = treasury;
        pool.isDefaultAllocations = false;
        emit UpdateAllocation(
            poolAddress,
            reinvest,
            commisions,
            rewards,
            treasury
        );
    }

    /**
    @dev The function configures the default  distribution of rewards for all pools if pools havent individualallocations. 
    reinvest must be between 0 and 10000, it was separated from other percentages for gas optimization.
    commissions + rewards + treasury should be equal to 10000(PRECISSION).
    Only the owner or admin can call.
    @param reinvest reinvest percent
    @param commisions commissions percent
    @param rewards rewards percent
    @param treasury treasury percent
    */
    function updateDefaultAllocationPercents(
        uint256 reinvest,
        uint256 commisions,
        uint256 rewards,
        uint256 treasury
    ) external onlyAdmin whenNotPaused {
        _require(
            commisions + rewards + treasury == PRECISSION,
            Errors.INVALID_PERCENT
        );
        _require(reinvest <= PRECISSION, Errors.PERCENT_ERROR);
        defaultAllocations = Allocations({
            reinvestedPercent: reinvest,
            rewardsPercent: rewards,
            treasuryPercent: treasury,
            commisionsPercent: commisions
        });
        emit UpdateDefaultAllocation(reinvest, commisions, rewards, treasury);
    }

    /**
    @dev The function switches between default and individual reward distribution types
    @param poolAddress pool address
    @param isDefault if true pool use default allocations else if false pool use individual allocations
    */
    function changePoolAllocationType(address poolAddress, bool isDefault)
        external
        onlyAdmin
        isAdded(poolAddress)
        whenNotPaused
    {
        Pool storage pool = poolInfo[poolAddress];
        _require(
            isDefault != pool.isDefaultAllocations,
            Errors.ALREADY_ASSIGNED
        );
        _require(
            pool.allocations.commisionsPercent +
                pool.allocations.rewardsPercent +
                pool.allocations.treasuryPercent ==
                PRECISSION,
            Errors.PERCENT_ERROR
        );
        pool.isDefaultAllocations = isDefault;
        emit UpdatePoolAllocationType(poolAddress, isDefault);
    }

    /**
    @dev The function updates the exit token index for a specific pool.
    Only the owner or admin can call.
    @param poolAddress pool address.
    @param exitIndex exit token index in pool tokens array.
    */
    function updateExitTokenIndex(address poolAddress, uint256 exitIndex)
        external
        onlyAdmin
        isAdded(poolAddress)
        whenNotPaused
    {
        Pool storage pool = poolInfo[poolAddress];
        _require(exitIndex < pool.tokens.length, Errors.INVALID_INDEX);
        pool.exitTokenIndex = exitIndex;
        emit UpdatePoolExitTokenIndex(poolAddress, pool.exitTokenIndex);
    }

    /**
    @dev The function updates the deposit type for a specific pool.
    Only the owner or admin can call.
    @param poolAddress pool address.
    @param depositInOneToken boolean value if true the deposits makes in one token, if false then in all pool tokens  .
    */
    function updatePoolDepositType(address poolAddress, bool depositInOneToken)
        external
        onlyAdmin
        isAdded(poolAddress)
        whenNotPaused
    {
        Pool storage pool = poolInfo[poolAddress];
        _require(
            pool.isDepositInOneToken != depositInOneToken,
            Errors.ALREADY_ASSIGNED
        );
        pool.isDepositInOneToken = depositInOneToken;
        emit UpdatePoolDepositType(poolAddress, pool.isDepositInOneToken);
    }

    /**
    @dev The function updates the exit type for a specific pool.
    Only the owner or admin can call.
    @param poolAddress pool address.
    @param exitInOneToken boolean value if true the withdraw makes in one token, if false then in all pool tokens  .
    */
    function updatePoolExitType(address poolAddress, bool exitInOneToken)
        external
        onlyAdmin
        isAdded(poolAddress)
        whenNotPaused
    {
        Pool storage pool = poolInfo[poolAddress];
        _require(
            pool.isExitInOneToken != exitInOneToken,
            Errors.ALREADY_ASSIGNED
        );
        pool.isExitInOneToken = exitInOneToken;
        emit UpdatePoolExitType(poolAddress, pool.isExitInOneToken);
    }

    /**
    @dev The function updates deposit tokens settings(deposit token address andswap route for deposit token) for a specific pool.
    Only the owner or admin can call.
    @param poolAddress pool address.
    @param depositTokenAddress new deposit token address
    @param newSwapRoute swap route for usdc to deposit token.
    */
    function updateDepositTokenSettings(
        address poolAddress,
        address depositTokenAddress,
        bytes32 newSwapRoute
    ) external onlyAdmin isAdded(poolAddress) whenNotPaused {
        Pool storage pool = poolInfo[poolAddress];
        pool.depositToken = depositTokenAddress;
        pool.swapRouteForDepositToken = newSwapRoute;
        emit UpdateDepositTokenSettings(
            poolAddress,
            newSwapRoute,
            depositTokenAddress
        );
    }

    /**
    @dev The function updates exit token settings(exit token address, exit token index 
    and swap route for exit token) for a specific pool.
    Only the owner or admin can call.
    @param poolAddress pool address.
    @param exitTokenAddress new exit token address
    @param newSwapRoute swap route for deposit token to usdc.
    @param exitIndex token index in array of pool tokens.
    */
    function updateExitTokenSettings(
        address poolAddress,
        address exitTokenAddress,
        bytes32 newSwapRoute,
        uint256 exitIndex
    ) external onlyAdmin isAdded(poolAddress) whenNotPaused {
        Pool storage pool = poolInfo[poolAddress];
        _require(exitIndex < pool.tokens.length, Errors.INVALID_INDEX);
        pool.exitToken = exitTokenAddress;
        pool.exitTokenIndex = exitIndex;
        pool.swapRouteForExitToken = newSwapRoute;
        emit UpdateExitTokenSettings(
            poolAddress,
            newSwapRoute,
            exitTokenAddress,
            exitIndex
        );
    }

    /**
    @dev The function updates the swap routes for pool tokens for a specific pool.
    Only the owner or admin can call.
    @param poolAddress pool address.
    @param newSwapRoutes swap routes for pool tokens.
    */
    function updatePoolSwapRoutes(
        address poolAddress,
        bytes32[] memory newSwapRoutes
    ) external onlyAdmin isAdded(poolAddress) whenNotPaused {
        Pool storage pool = poolInfo[poolAddress];
        _require(
            newSwapRoutes.length == pool.tokens.length,
            Errors.INVALID_ARRAY_LENGHTS
        );
        pool.swapRoutes = newSwapRoutes;
        emit UpdatePoolSwapRoutes(poolAddress, pool.swapRoutes);
    }

    /** 
    @dev The function acts as a switch, turning pool activity on and off.
    Only the owner or admin can call.
    @param poolAddress pool address.
    */
    function togglePoolActivity(address poolAddress)
        external
        onlyAdmin
        isAdded(poolAddress)
        whenNotPaused
    {
        Pool storage pool = poolInfo[poolAddress];
        pool.isActive = !pool.isActive;
        emit TogglePoolActivity(poolAddress, pool.isActive);
    }

    /** 
    @dev Function performs contract administrator updates. 
    Only the owner can call.
    @param newAdmin new admin wallet address.
    */
    function updateAdmin(address newAdmin) external onlyOwner whenNotPaused {
        _require(newAdmin != adminWallet, Errors.ALREADY_ASSIGNED);
        adminWallet = newAdmin;
        emit UpdateAdminWallet(newAdmin);
    }

    /** 
    @dev The function enables a pause on the contract in case the contract is hacked.
    Methods that use the whenNotPaused modifier will not work.
    Only the owner can call.
    */
    function pause() external onlyOwner {
        _pause();
    }

    /** 
    @dev The function turns off the pause, the contract returns to the normal working state
    Only the owner can call.
    */
    function unPause() external onlyOwner {
        _unpause();
    }

    /**
    @dev External function for emergency withdrawing tokens from the YO.
    Only the owner or admin can call.
    @param token token address.
    @param amount withdraw token amount.
    @param recipient recipient wallet address.
    */
    function emergencyWithdraw(
        address token,
        uint256 amount,
        address recipient
    ) external onlyOwner {
        _withdraw(token, amount, recipient);
        emit EmergencyWithdraw(token, amount, recipient);
    }

    //======================================================= Public Functions ========================================================
    /**
    @dev Public view function returns implementation address.
    */
    function getImplementation() public view returns (address) {
        address impl = _getImplementation();
        return impl;
    }

    /**
    @dev Public view function returns swap routes for pool tokens.
    @param poolAddress pool address.
    */
    function getPoolSwapRoutes(address poolAddress)
        external
        view
        returns (bytes32[] memory)
    {
        Pool storage pool = poolInfo[poolAddress];
        return pool.swapRoutes;
    }

    //======================================================= Internal Functions ========================================================

    /**
    @dev Helper internal function for withdrawing allowed tokens from Treasury contract.
    @param token withdraw token address
    @param amount withdraw token amount.
    @param user user wallet address.
    */
    function _withdraw(
        address token,
        uint256 amount,
        address user
    ) internal {
        if (token == address(0)) {
            _require(address(this).balance >= amount, Errors.NOT_ENOUGH_TOKENS);
            (bool sent, ) = user.call{value: amount}("");
            _require(sent, Errors.FAILED_SENT_ETHER);
        } else {
            uint256 balanceToken = IERC20Upgradeable(token).balanceOf(
                address(this)
            );
            _require(balanceToken >= amount, Errors.NOT_ENOUGH_TOKENS);
            IERC20Upgradeable(token).safeTransfer(user, amount);
        }
    }

    /**
    @dev internal function that performs investment in one token of the pool
    @param pool see struct Pool.
    @param amount deposit token amount.
    */
    function _investInOneToken(Pool memory pool, uint256 amount)
        internal
        returns (uint256[] memory)
    {
        uint256[] memory outAmounts = new uint256[](pool.tokens.length);
        if (pool.depositToken == usdcToken) {
            for (uint256 i = 0; i < pool.tokens.length; i++) {
                if (pool.tokens[i] == usdcToken) {
                    outAmounts[i] = amount;
                } else outAmounts[i] = 0;
            }
        } else {
            uint256 depositTokenAmount = _balancerSwap(
                pool.swapRouteForDepositToken,
                usdcToken,
                pool.depositToken,
                amount
            );

            for (uint256 i = 0; i < pool.tokens.length; i++) {
                if (pool.tokens[i] == pool.depositToken) {
                    outAmounts[i] = depositTokenAmount;
                } else {
                    outAmounts[i] = 0;
                }
            }
        }
        return outAmounts;
    }

    /**
    @dev internal function that invests in all tokens of the pool according to their weight in the pool.
    @param pool see struct Pool.
    @param amount deposit token amount.
    */
    function _investInAllTokens(Pool memory pool, uint256 amount)
        internal
        returns (uint256[] memory)
    {
        uint256[] memory outAmounts = new uint256[](pool.tokens.length);
        uint256[] memory giveAmounts = new uint256[](pool.tokens.length);

        if (pool.depositToken == usdcToken) {
            for (uint256 i = 0; i < pool.tokens.length; i++) {
                outAmounts[i] = (amount * pool.tokensWeights[i]) / 1e18;
            }
            for (uint256 i = 0; i < pool.tokens.length; i++) {
                if (pool.tokens[i] != usdcToken) {
                    giveAmounts[i] = _balancerSwap(
                        pool.swapRoutes[i],
                        usdcToken,
                        pool.tokens[i],
                        outAmounts[i]
                    );
                } else {
                    giveAmounts[i] = outAmounts[i];
                }
            }
        } else {
            uint256 depositTokenAmount = _balancerSwap(
                pool.swapRouteForDepositToken,
                usdcToken,
                pool.depositToken,
                amount
            );

            for (uint256 i = 0; i < pool.tokens.length; i++) {
                outAmounts[i] =
                    (depositTokenAmount * pool.tokensWeights[i]) /
                    1e18;
            }

            for (uint256 i = 0; i < pool.tokens.length; i++) {
                if (pool.tokens[i] != pool.depositToken) {
                    giveAmounts[i] = _balancerSwap(
                        pool.swapRoutes[i],
                        pool.depositToken,
                        pool.tokens[i],
                        outAmounts[i]
                    );
                } else {
                    giveAmounts[i] = outAmounts[i];
                }
            }
        }
        return giveAmounts;
    }

    /**
    @dev internal function that makes withdraw from pool in one token and swap this token to usdc.
    @param pool see struct Pool.
    @param bptAmount beethoven pool token amount.
    */
    function _withdrawFromPoolInOneToken(Pool memory pool, uint256 bptAmount)
        internal
        returns (uint256)
    {
        uint256[] memory outAmounts = new uint256[](pool.tokens.length);
        uint256 balanceBefore;
        uint256 balanceAfter;

        for (uint256 i = 0; i < pool.tokens.length; i++) {
            outAmounts[i] = 0;
        }
        balanceBefore = IERC20Upgradeable(pool.exitToken).balanceOf(
            address(this)
        );
        _balancerExitInOneToken(
            pool.poolId,
            pool.tokens,
            outAmounts,
            bptAmount,
            pool.exitTokenIndex
        );
        balanceAfter = IERC20Upgradeable(pool.exitToken).balanceOf(
            address(this)
        );
        uint256 exitBalance = balanceAfter - balanceBefore;

        uint256 usdcExitAmount;

        if (pool.exitToken == usdcToken) {
            usdcExitAmount = exitBalance;
        } else {
            usdcExitAmount = _balancerSwap(
                pool.swapRouteForExitToken,
                pool.exitToken,
                usdcToken,
                exitBalance
            );
        }
        return usdcExitAmount;
    }

    /**
    @dev internal function that makes withdraw from pool in all pool tokens and swap this tokens to usdc.
    @param pool see struct Pool.
    @param bptAmount beethoven pool token amount.
    */
    function _withdrawFromPoolInAllTokens(Pool memory pool, uint256 bptAmount)
        internal
        returns (uint256)
    {
        uint256[] memory outAmounts = new uint256[](pool.tokens.length);
        uint256[] memory balancesBefore = new uint256[](pool.tokens.length);
        uint256[] memory balancesAfter = new uint256[](pool.tokens.length);

        for (uint256 i = 0; i < pool.tokens.length; i++) {
            outAmounts[i] = 0;
        }

        balancesBefore = _checkBalances(pool.tokens);
        _balancerExitInAllTokens(
            pool.poolId,
            pool.tokens,
            outAmounts,
            bptAmount
        );
        balancesAfter = _checkBalances(pool.tokens);
        uint256[] memory exitBalances = _calcBalance(
            balancesBefore,
            balancesAfter
        );
        uint256 usdcExitAmount;
        if (pool.exitToken == usdcToken) {
            for (uint256 i = 0; i < pool.tokens.length; i++) {
                if (pool.tokens[i] != usdcToken) {
                    usdcExitAmount += _balancerSwap(
                        pool.swapRoutes[i],
                        pool.tokens[i],
                        usdcToken,
                        exitBalances[i]
                    );
                } else {
                    usdcExitAmount += exitBalances[i];
                }
            }
        } else {
            uint256 exitTokenAmount;
            for (uint256 i = 0; i < pool.tokens.length; i++) {
                if (pool.tokens[i] != pool.exitToken) {
                    exitTokenAmount += _balancerSwap(
                        pool.swapRoutes[i],
                        pool.tokens[i],
                        pool.exitToken,
                        exitBalances[i]
                    );
                } else {
                    exitTokenAmount += exitBalances[i];
                }
            }
            usdcExitAmount = _balancerSwap(
                pool.swapRouteForDepositToken,
                pool.exitToken,
                usdcToken,
                exitTokenAmount
            );
        }
        return usdcExitAmount;
    }

    /**
    @dev auxiliary function to calculate the balance of tokens on the contract.
    @param balancesBefore see struct Pool.
    @param balancesAfter beethoven pool token amount.
    */
    function _calcBalance(
        uint256[] memory balancesBefore,
        uint256[] memory balancesAfter
    ) internal pure returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](balancesBefore.length);
        for (uint256 i = 0; i < balancesBefore.length; i++) {
            balances[i] = balancesAfter[i] - balancesBefore[i];
        }
        return balances;
    }

    /**
    @dev The function exits the pool in all tokens. Creates a request and invokes the Beethoven X Vault contract.
    @param _poolId pool Id.
    @param _tokens array of pool tokens addresses.
    @param _amounts array of pool tokens amounts.
    @param bptAmount beethoven pool token amount
    */
    function _balancerExitInAllTokens(
        bytes32 _poolId,
        address[] memory _tokens,
        uint256[] memory _amounts,
        uint256 bptAmount
    ) internal {
        bytes memory userData = abi.encode(1, bptAmount);
        IVault.ExitPoolRequest memory request = IVault.ExitPoolRequest(
            _tokens,
            _amounts,
            userData,
            false
        );

        IVault(vault).exitPool(
            _poolId,
            address(this),
            payable(address(this)),
            request
        );
    }

    /**
    @dev The function exits the pool in one token. Creates a request and invokes the Beethoven X Vault contract.
    @param _poolId pool Id.
    @param _tokens array of pool tokens addresses.
    @param _amounts array of pool tokens amounts.
    @param bptAmount beethoven pool token amount.
    @param exitTokenIndex exit token index in pool tokens array.
    */
    function _balancerExitInOneToken(
        bytes32 _poolId,
        address[] memory _tokens,
        uint256[] memory _amounts,
        uint256 bptAmount,
        uint256 exitTokenIndex
    ) internal {
        bytes memory userData = abi.encode(0, bptAmount, exitTokenIndex);
        IVault.ExitPoolRequest memory request = IVault.ExitPoolRequest(
            _tokens,
            _amounts,
            userData,
            false
        );

        IVault(vault).exitPool(
            _poolId,
            address(this),
            payable(address(this)),
            request
        );
    }

    /**
    @dev The function performs a deposit to pool in one or all tokens in the pool.
    Depending on the number of tokens transferred. Creates a request and invokes the Beethoven X Vault contract.
    @param _poolId pool Id.
    @param _tokens array of pool tokens addresses.
    @param _amounts array of pool tokens amounts.
    */
    function _balancerJoin(
        bytes32 _poolId,
        address[] memory _tokens,
        uint256[] memory _amounts
    ) internal {
        bytes memory userData = abi.encode(1, _amounts, 1);

        IVault.JoinPoolRequest memory request = IVault.JoinPoolRequest(
            _tokens,
            _amounts,
            userData,
            false
        );

        IVault(vault).joinPool(_poolId, address(this), address(this), request);
    }

    /**
    @dev The function performs a swap through Beethoven X pools. 
    It creates a request and calls the swap method.
    @param _poolId pool Id.
    @param _tokenIn token in.
    @param _tokenOut token out.
    @param _amountIn tokenIn amount
    */
    function _balancerSwap(
        bytes32 _poolId,
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) internal returns (uint256) {
        IVault.SingleSwap memory singleSwap = IVault.SingleSwap(
            _poolId,
            IVault.SwapKind.GIVEN_IN,
            _tokenIn,
            _tokenOut,
            _amountIn,
            ""
        );
        return IVault(vault).swap(singleSwap, funds, 1, block.timestamp);
    }

    /**
    @dev The function checks the balances of tokens transferred to it. 
    And returns an array of balances.
    @param tokens array of tokens adresses.
    */
    function _checkBalances(address[] memory tokens)
        internal
        view
        returns (uint256[] memory)
    {
        uint256[] memory balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            balances[i] = IERC20Upgradeable(tokens[i]).balanceOf(address(this));
        }
        return balances;
    }

    /**
    @dev An auxiliary function for calculating the amount of the transfer and which will be distributed between rewards, 
    commissions and treasury.
    @param poolAddress pool address
    @param amount bpt tokens amount
    */
    function _calcHarvestAmount(address poolAddress, uint256 amount)
        internal
        view
        returns (uint256 reinvest, uint256 totalWithdrawAmount)
    {
        Pool storage pool = poolInfo[poolAddress];
        if (!pool.isDefaultAllocations) {
            reinvest =
                (amount * pool.allocations.reinvestedPercent) /
                PRECISSION;
            totalWithdrawAmount = amount - reinvest;
        } else {
            reinvest =
                (amount * defaultAllocations.reinvestedPercent) /
                PRECISSION;
            totalWithdrawAmount = amount - reinvest;
        }
    }

    /**
    @dev function performs approve erc20 tokens.
    @param token erc20 token interface
    @param spender spender address
    */
    function _makeApprove(IERC20Upgradeable token, address spender) internal {
        uint256 allowance = token.allowance(address(this), spender);
        if(allowance < type(uint256).max) {
           token.safeIncreaseAllowance(spender, type(uint256).max - allowance); 
        }
    }


    /**
    @dev 
    An auxiliary function for calculating the distribution of commissions, rewards and treasury parts.
    @param poolAddress pool address
    @param usdcAmount bpt tokens amount
    */
    function _allocate(address poolAddress, uint256 usdcAmount)
        internal
        view
        returns (
            uint256 commisions,
            uint256 rewards,
            uint256 treasury
        )
    {
        Pool storage pool = poolInfo[poolAddress];
        if (!pool.isDefaultAllocations) {
            commisions =
                (usdcAmount * pool.allocations.commisionsPercent) /
                PRECISSION;
            rewards =
                (usdcAmount * pool.allocations.rewardsPercent) /
                PRECISSION;
            treasury =
                (usdcAmount * pool.allocations.treasuryPercent) /
                PRECISSION;
        } else {
            commisions =
                (usdcAmount * defaultAllocations.commisionsPercent) /
                PRECISSION;
            rewards =
                (usdcAmount * defaultAllocations.rewardsPercent) /
                PRECISSION;
            treasury =
                (usdcAmount * defaultAllocations.treasuryPercent) /
                PRECISSION;
        }
    }

    /**
     * @dev Function that should revert when `msg.sender` is not authorized to upgrade the contract. Called by
     * {upgradeTo} and {upgradeToAndCall}.
     *
     * Normally, this function will use an xref:access.adoc[access control] modifier such as {Ownable-onlyOwner}.
     *
     * ```solidity
     * function _authorizeUpgrade(address) internal override onlyOwner {}
     * ```
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}
