// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../interfaces/IUniswapV2Router.sol";
import "../interfaces/IYieldOptimizer.sol";
import "../lib/ErrorsStaking.sol";

contract YieldOptimizerStakingV2 is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    Allocations public defaultAllocations;

    struct Allocations {
        uint256 reinvestedPercent; // The percentage of rewards that will be reinvested
        uint256 treasuryPercent; // A percentage of the rewards that will be exchanged for USDC token and sent to the treasury
        uint256 commisionsPercent; // A percentage of the rewards that will be used as a project commission
    }

    struct Epoch {
        uint256 commisions; // Amount of collected commissions in USDC token per epoch
        uint256 reinvestedLPT; // The amount of reinvested BPT tokens per epoch
        uint256 treasuryRevenue; // Amount of collected treasury revenue in USDC token per epoch
        uint256 start; // epoch start timestamp
        uint256 end; // epoch end timestamp
    }

    uint256 private constant PRECISSION = 10000; // PRECISSION for math operation
    address public usdcToken; // USDC token
    address public jukuToken; // Juku token address
    address public usdcJukuPair;
    address public swapRouter; // swap router address
    address public yo;
    address public adminWallet;
    address public revenueRecipient; // treasury revenue recipient
    address[] public pathToJuku; // SwapRoute to Juku token
    address[] public pathToUsdc; // SwapRoute to USDC token
    mapping(uint256 => Epoch) public swapFeesAllocations; // information about the distribution of swap fees in the epoch
    uint256 public epochCounter; // a counter of the number of epochs for a staking

    event Invest(
        address pair,
        address token,
        uint256 amount,
        uint256 liquidity,
        address user,
        string userId
    );

    event AutoInvest(
        address pair,
        address token,
        uint256 amount,
        uint256 liquidity
    );

    event WithdrawFromStaking(
        address pair,
        uint256 liquidity,
        uint256 usdcAmount,
        address user,
        string userId
    );

    event Harvest(
        address pair,
        uint256 reinvestLpAmount,
        uint256 commisionsUsdcAmount,
        uint256 treasuryUsdcAmount,
        uint256 timestamp
    );

    // @notice emitted when the revenue recipient address is changed
    event UpdateRevenueRecipient(address newRecipient);

    // @notice emitted when setting up the default reward distribution
    event UpdateDefaultAllocation(
        uint256 reinvest,
        uint256 commisions,
        uint256 treasury
    );
    // @notice emitted when the address of the swapRouter contract is updated
    event UpdateSwapRouter(address newSwapRouter);
    // @notice emitted when the swap route for juku token is updated
    event UpdatePathToJuku(address[] newPath);
    // @notice emitted when the swap route for juku token is updated
    event UpdatePathToUsdc(address[] newPath);
    // @notice emitted when the adminWallet is changed
    event UpdateAdminWallet(address newAdmin);
    event EmergencyWithdraw(address token, uint256 amount, address recipient);
    event UpdateYO(address newYoAddress);
    event UpdateUsdcAddress(address newAddress);
    event UpdateJukuAddress(address newAddress);
    event UpdatePair(address newPair);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _jukuToken,
        address _usdcToken,
        address _usdcJukuPair,
        address _swapRouter,
        address _yo,
        address _admin,
        address _revenueRecipient,
        uint256 _reinvestedPercent,
        uint256 _treasuryPercent,
        uint256 _commisionsPercent
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __Pausable_init();

        _require(
            _yo != address(0) &&
                _admin != address(0) &&
                _usdcToken != address(0) &&
                _jukuToken != address(0) &&
                _swapRouter != address(0) &&
                _revenueRecipient != address(0),
            Errors.ZERO_ADDRESS
        );

        _require(
            _commisionsPercent + _treasuryPercent == PRECISSION,
            Errors.INVALID_PERCENT
        );
        _require(_reinvestedPercent <= PRECISSION, Errors.PERCENT_ERROR);
        usdcToken = _usdcToken;
        jukuToken = _jukuToken;
        usdcJukuPair = _usdcJukuPair;
        swapRouter = _swapRouter;
        adminWallet = _admin;
        yo = _yo;
        revenueRecipient = _revenueRecipient;
        pathToJuku = [_usdcToken, _jukuToken];
        pathToUsdc = [_jukuToken, _usdcToken];

        defaultAllocations = Allocations({
            reinvestedPercent: _reinvestedPercent,
            treasuryPercent: _treasuryPercent,
            commisionsPercent: _commisionsPercent
        });

        Epoch storage newEpoch = swapFeesAllocations[epochCounter];
        newEpoch.start = block.timestamp;

        IERC20Upgradeable(_usdcToken).approve(_swapRouter, type(uint256).max);
        IERC20Upgradeable(_jukuToken).approve(_swapRouter, type(uint256).max);
        IERC20Upgradeable(_usdcJukuPair).approve(
            _swapRouter,
            type(uint256).max
        );
    }

    receive() external payable {}

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

    function invest(
        address token,
        uint256 amount,
        address user,
        string memory userId
    ) external onlyAdmin whenNotPaused {
        uint256 liquidity = _invest(token, amount);
        emit Invest(usdcJukuPair, token, amount, liquidity, user, userId);
    }

    function autoInvest(address token, uint256 amount)
        external
        onlyAdmin
        whenNotPaused
    {
        uint256 liquidity = _invest(token, amount);
        emit AutoInvest(usdcJukuPair, token, amount, liquidity);
    }

    function withdrawFromStaking(
        uint256 amount,
        address user,
        string memory userId
    ) external onlyAdmin whenNotPaused {
        _require(amount > 0, Errors.ZERO_AMOUNT);
        IYieldOptimizer(yo).replenishStaking(usdcJukuPair, amount);
        uint256 withdrawUsdcAmount = _withdrawFromStaking(amount);
        IERC20Upgradeable(usdcToken).safeTransfer(yo, withdrawUsdcAmount);
        emit WithdrawFromStaking(
            usdcJukuPair,
            amount,
            withdrawUsdcAmount,
            user,
            userId
        );
    }

    function harvest(uint256 amount) external onlyAdmin whenNotPaused {
        _require(amount > 0, Errors.ZERO_AMOUNT);
        (uint256 reinvest, uint256 totalWithdrawAmount) = _calcHarvestAmount(
            amount
        );
        IYieldOptimizer(yo).replenishStaking(usdcJukuPair, totalWithdrawAmount);

        uint256 withdrawUsdcAmount = _withdrawFromStaking(totalWithdrawAmount);
        (uint256 commisions, uint256 treasury) = _allocate(withdrawUsdcAmount);

        Epoch storage epoch = swapFeesAllocations[epochCounter];
        epoch.commisions = commisions;
        epoch.treasuryRevenue = treasury;
        epoch.reinvestedLPT = reinvest;
        epoch.end = block.timestamp;

        ++epochCounter;
        Epoch storage newEpoch = swapFeesAllocations[epochCounter];
        newEpoch.start = block.timestamp;

        IERC20Upgradeable(usdcToken).safeTransfer(revenueRecipient, treasury);
        IERC20Upgradeable(usdcToken).safeTransfer(yo, commisions);
        emit Harvest(
            usdcJukuPair,
            reinvest,
            commisions,
            treasury,
            block.timestamp
        );
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
        _require(newRecipient != address(0), Errors.ZERO_ADDRESS);
        revenueRecipient = newRecipient;
        emit UpdateRevenueRecipient(newRecipient);
    }

    /**
    @dev The function configures the  distribution of rewards for staking. 
    reinvest must be between 0 and 10000, it was separated from other percentages for gas optimization.
    commissions + treasury should be equal to 10000(PRECISSION).
    Only the owner or admin can call.
    @param reinvest reinvest percent
    @param commisions commissions percent
    @param treasury treasury percent
    */
    function updateDefaultAllocationPercents(
        uint256 reinvest,
        uint256 commisions,
        uint256 treasury
    ) external onlyAdmin whenNotPaused {
        _require(commisions + treasury == PRECISSION, Errors.INVALID_PERCENT);
        _require(reinvest <= PRECISSION, Errors.PERCENT_ERROR);
        defaultAllocations = Allocations({
            reinvestedPercent: reinvest,
            treasuryPercent: treasury,
            commisionsPercent: commisions
        });
        emit UpdateDefaultAllocation(reinvest, commisions, treasury);
    }

    /** 
    @dev Function performs contract administrator updates. 
    Only the owner can call.
    @param newAdmin new admin wallet address.
    */
    function updateAdmin(address newAdmin) external onlyOwner whenNotPaused {
        _require(newAdmin != adminWallet, Errors.ALREADY_ASSIGNED);
        _require(newAdmin != address(0), Errors.ZERO_ADDRESS);
        adminWallet = newAdmin;
        emit UpdateAdminWallet(newAdmin);
    }

    /**
    @dev The function updates the swap router address
    @param newSwapRouter new swap router adrress
    */
    function updateSwapRouter(address newSwapRouter)
        external
        onlyAdmin
        whenNotPaused
    {
        _require(newSwapRouter != swapRouter, Errors.ALREADY_ASSIGNED);
        _require(newSwapRouter != address(0), Errors.ZERO_ADDRESS);
        swapRouter = newSwapRouter;
        emit UpdateSwapRouter(newSwapRouter);
    }

    /**
    @dev The function updates path to juku
    @param newPath new swap route for juku
    */
    function updatePathToJuku(address[] memory newPath)
        external
        onlyAdmin
        whenNotPaused
    {
        pathToJuku = newPath;
        emit UpdatePathToJuku(newPath);
    }

    /**
    @dev The function updates path to usdc token
    @param newPath new swap route for usdc token
    */
    function updatePathToUsdc(address[] memory newPath)
        external
        onlyAdmin
        whenNotPaused
    {
        pathToUsdc = newPath;
        emit UpdatePathToUsdc(newPath);
    }

    function updateYO(address newYo) external onlyAdmin whenNotPaused {
        _require(newYo != yo, Errors.ALREADY_ASSIGNED);
        _require(newYo != address(0), Errors.ZERO_ADDRESS);
        yo = newYo;
        emit UpdateYO(newYo);
    }

    function updateUsdcAddress(address newAddress)
        external
        onlyAdmin
        whenNotPaused
    {
        _require(newAddress != usdcToken, Errors.ALREADY_ASSIGNED);
        _require(newAddress != address(0), Errors.ZERO_ADDRESS);
        usdcToken = newAddress;
        emit UpdateUsdcAddress(newAddress);
    }

    function updateJukuAddress(address newAddress)
        external
        onlyAdmin
        whenNotPaused
    {
        _require(newAddress != jukuToken, Errors.ALREADY_ASSIGNED);
        _require(newAddress != address(0), Errors.ZERO_ADDRESS);
        jukuToken = newAddress;
        emit UpdateJukuAddress(newAddress);
    }

    function updatePair(address newPair) external onlyAdmin whenNotPaused {
        _require(newPair != usdcJukuPair, Errors.ALREADY_ASSIGNED);
        _require(newPair != address(0), Errors.ZERO_ADDRESS);
        usdcJukuPair = newPair;
        emit UpdatePair(newPair);
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

    function upgraded() public pure returns (bool) {
        return true;
    }

    //======================================================= Internal Functions ========================================================
    function _invest(address token, uint256 amount) internal returns (uint256) {
        _require(
            token == usdcToken || token == jukuToken,
            Errors.INVALID_TOKEN
        );
        _require(amount > 0, Errors.ZERO_AMOUNT);

        IYieldOptimizer(yo).replenishStaking(token, amount);
        address[] memory path = token == jukuToken ? pathToUsdc : pathToJuku;

        uint256[] memory amounts = IUniswapV2Router(swapRouter)
            .swapExactTokensForTokens(
                (amount / 2),
                0,
                path,
                address(this),
                block.timestamp
            );

        (, , uint256 liquidity) = IUniswapV2Router(swapRouter).addLiquidity(
            path[0],
            path[1],
            amounts[0],
            amounts[1],
            1,
            1,
            yo,
            block.timestamp
        );
        return liquidity;
    }

    function _withdrawFromStaking(uint256 amount)
        internal
        returns (uint256 withdrawUsdcAmount)
    {
        (uint256 amountA, uint256 amountB) = IUniswapV2Router(swapRouter)
            .removeLiquidity(
                jukuToken,
                usdcToken,
                amount,
                1,
                1,
                address(this),
                block.timestamp
            );

        uint256[] memory amounts = IUniswapV2Router(swapRouter)
            .swapExactTokensForTokens(
                amountA,
                1,
                pathToUsdc,
                address(this),
                block.timestamp
            );
        withdrawUsdcAmount = amounts[1] + amountB;
    }

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
    @dev An auxiliary function for calculating the amount of the transfer and which will be distributed between rewards, 
    commissions and treasury.
    @param amount bpt tokens amount
    */
    function _calcHarvestAmount(uint256 amount)
        internal
        view
        returns (uint256 reinvest, uint256 totalWithdrawAmount)
    {
        reinvest = defaultAllocations.reinvestedPercent > 0
            ? (amount * defaultAllocations.reinvestedPercent) / PRECISSION
            : 0;
        totalWithdrawAmount = amount - reinvest;
    }

    /**
    @dev 
    An auxiliary function for calculating the distribution of commissions, rewards and treasury parts.
    @param usdcAmount bpt tokens amount
    */
    function _allocate(uint256 usdcAmount)
        internal
        view
        returns (uint256 commisions, uint256 treasury)
    {
        commisions = defaultAllocations.commisionsPercent > 0
            ? (usdcAmount * defaultAllocations.commisionsPercent) / PRECISSION
            : 0;
        treasury = defaultAllocations.treasuryPercent > 0
            ? (usdcAmount * defaultAllocations.treasuryPercent) / PRECISSION
            : 0;
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
