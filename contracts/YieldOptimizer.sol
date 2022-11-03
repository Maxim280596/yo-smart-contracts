// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IUniswapV2Router.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IWeightedPool.sol";

contract YieldOptimizer is Ownable {
    using SafeERC20 for IERC20;
    using Address for address;

    IUniswapV2Router public swapRouter;
    IVault.FundManagement public funds;
    IVault.SwapKind public swapKind;

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
        string poolName; // pool name
        bool isActive; // If true the pull works, if false then not
        bool isDepositInOneToken; // if true the deposits makes in one token, if false then in all pool tokens
        bool isExitInOneToken; // if true the withdrawals makes in one token, if false then in all pool tokens
    }

    address public usdcToken; // usdt token
    address public admin; // contract admin address
    address public vault; // Beethoven X vault address
    uint256 public poolsCounter; // pools counter
    mapping(address => Pool) public poolInfo; // Info about pool. See Pool struct.

    //======================================================= Erorrs ========================================================

    error NotActive(string err);
    error PoolIsAdded(string err);
    error NotEnoughTokens(string err);
    error InvalidArrayLengths(string err);
    error ZeroAddress(string err);
    error PoolNotAdded(string err);
    error AlreadyAssigned(string err);
    error InvalidIndex(string err);
    error ZeroAmount(string err);
    error FailedSentEther(string err);
    error AccessIsDenied(string err);

    //======================================================= Events ========================================================

    event Withdraw(
        address indexed token,
        uint256 indexed amount,
        address indexed user,
        string userId
    );
    event UpdateAdmin(address newAdmin);
    event UpdateAllowedToken(
        address token,
        uint256 indexed swapLimit,
        uint256 indexed withdrawLimit,
        bool indexed allowed
    );
    event Invest(
        bytes32 poolId,
        address indexed pool,
        uint256 indexed amountUsdc,
        uint256 indexed bptAmount,
        address user,
        string userId
    );
    event WithdrawFromPool(
        bytes32 poolId,
        address indexed pool,
        uint256 indexed amountUsdc,
        uint256 indexed bptAmount,
        address user,
        string userId
    );
    event AddPool(
        address pool,
        bytes32 poolId,
        address[] poolTokens,
        uint256[] poolTokensWeights
    );
    event UpdatePoolExitTokenIndex(address pool, uint256 exitTokenIndex);
    event UpdatePoolDepositType(address pool, bool depositType);
    event UpdatePoolExitType(address pool, bool exitType);
    event UpdateSwapRouteForDepositToken(address pool, bytes32 newSwapRoute);
    event UpdateSwapRouteForExitToken(address pool, bytes32 newSwapRoute);
    event UpdatePoolSwapRoutes(address pool, bytes32[] swapRoutes);
    event TurnOnPool(address pool, bool isActive);
    event TurnOffPool(address pool, bool isActive);

    constructor(
        address _usdcToken, // USDT token address
        address _admin, // admin address
        address _vault // Beethoven X Vault address
    ) {
        if (
            _vault == address(0) ||
            _admin == address(0) ||
            _usdcToken == address(0)
        ) {
            revert ZeroAddress("YO: Zero Address");
        }
        vault = _vault;
        usdcToken = _usdcToken;
        admin = _admin;
        funds = IVault.FundManagement(
            address(this),
            false,
            payable(address(this)),
            false
        );
        swapKind = IVault.SwapKind.GIVEN_IN;
        IERC20(_usdcToken).approve(_vault, type(uint256).max);
    }

    receive() external payable {}

    //======================================================= Modifiers ========================================================

    modifier onlyAdmin() {
        if (msg.sender != admin && msg.sender != owner()) {
            revert AccessIsDenied("YO: Access is denied");
        }
        _;
    }

    modifier isActive(address poolAddress) {
        Pool storage pool = poolInfo[poolAddress];
        if (!pool.isActive) {
            revert NotActive("YO: Pool not active");
        }
        _;
    }

    modifier isAdded(address poolAddress) {
        Pool storage pool = poolInfo[poolAddress];
        if (pool.bptToken == address(0)) {
            revert PoolNotAdded("YO: Pool not added");
        }
        _;
    }

    //======================================================= External Functions ========================================================

    /**
    @dev Reserve external function for withdrawing allowed tokens from the  Treasury.
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
    ) external onlyAdmin {
        _withdraw(token, amount, user, userId);
    }

    function invest(
        address poolAddress,
        uint256 amount,
        address user,
        string memory userId
    ) external onlyAdmin isActive(poolAddress) {
        if (IERC20(usdcToken).balanceOf(address(this)) < amount) {
            revert NotEnoughTokens("YO: Not enough usdc");
        }
        Pool storage pool = poolInfo[poolAddress];

        uint256[] memory giveAmounts = pool.isDepositInOneToken
            ? _investInOneToken(pool, amount)
            : _investInAllTokens(pool, amount);

        uint256 bptBalanceBefore = IERC20(pool.bptToken).balanceOf(
            address(this)
        );
        _balancerJoin(pool.poolId, pool.tokens, giveAmounts);
        uint256 bptBalance = IERC20(pool.bptToken).balanceOf(address(this)) -
            bptBalanceBefore;

        emit Invest(
            pool.poolId,
            pool.bptToken,
            amount,
            bptBalance,
            user,
            userId
        );
    }

    function withdrawFromPool(
        address poolAddress,
        uint256 amount,
        address user,
        string memory userId
    ) external onlyAdmin isActive(poolAddress) {
        Pool storage pool = poolInfo[poolAddress];
        if (IERC20(pool.bptToken).balanceOf(address(this)) < amount) {
            revert NotEnoughTokens("YO: Not enough BPT");
        }
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
    ) external onlyAdmin {
        Pool storage pool = poolInfo[_poolAddress];
        if (pool.bptToken != address(0)) {
            revert PoolIsAdded("YO: Pool already added");
        }

        (address[] memory poolTokens, , ) = IVault(vault).getPoolTokens(
            _poolId
        );

        if (_swapRoutes.length != poolTokens.length) {
            revert InvalidArrayLengths("YO: Invalid array lengths");
        }
        if (
            _depositToken == address(0) ||
            _poolAddress == address(0) ||
            _exitToken == address(0)
        ) {
            revert ZeroAddress("YO: Zero Address");
        }

        pool.tokens = poolTokens;
        pool.poolId = _poolId;
        pool.poolName = IWeightedPool(_poolAddress).name();
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

        IERC20(_poolAddress).approve(vault, type(uint256).max);
        for (uint256 i; i <= poolTokens.length - 1; i++) {
            IERC20(poolTokens[i]).approve(vault, type(uint256).max);
        }
        ++poolsCounter;
        emit AddPool(
            pool.bptToken,
            pool.poolId,
            pool.tokens,
            pool.tokensWeights
        );
    }

    function updateExitTokenIndex(address poolAddress, uint256 exitIndex)
        external
        onlyAdmin
        isAdded(poolAddress)
    {
        Pool storage pool = poolInfo[poolAddress];
        if (exitIndex >= pool.tokens.length) {
            revert InvalidIndex("YO: Invalid index");
        }
        pool.exitTokenIndex = exitIndex;
        emit UpdatePoolExitTokenIndex(poolAddress, pool.exitTokenIndex);
    }

    function updatePoolDepositType(address poolAddress, bool depositInOneToken)
        external
        onlyAdmin
        isAdded(poolAddress)
    {
        Pool storage pool = poolInfo[poolAddress];
        if (pool.isDepositInOneToken == depositInOneToken) {
            revert AlreadyAssigned("YO: Value is already assigned");
        }
        pool.isDepositInOneToken = depositInOneToken;
        emit UpdatePoolDepositType(poolAddress, pool.isDepositInOneToken);
    }

    function updatePoolExitType(address poolAddress, bool exitInOneToken)
        external
        onlyAdmin
        isAdded(poolAddress)
    {
        Pool storage pool = poolInfo[poolAddress];
        if (pool.isExitInOneToken == exitInOneToken) {
            revert AlreadyAssigned("YO: Value is already assigned");
        }
        pool.isExitInOneToken = exitInOneToken;
        emit UpdatePoolExitType(poolAddress, pool.isExitInOneToken);
    }

    function updateSwapRouteForDepositToken(
        address poolAddress,
        bytes32 newSwapRoute
    ) external onlyAdmin isAdded(poolAddress) {
        Pool storage pool = poolInfo[poolAddress];
        pool.swapRouteForDepositToken = newSwapRoute;
        emit UpdateSwapRouteForDepositToken(
            poolAddress,
            pool.swapRouteForDepositToken
        );
    }

    function updateDepositTokenSettings(
        address poolAddress,
        address depositTokenAddress,
        bytes32 newSwapRoute
    ) external onlyAdmin isAdded(poolAddress) {
        Pool storage pool = poolInfo[poolAddress];
        if (depositTokenAddress == address(0)) {
            revert ZeroAddress("YO: Zero Address");
        }
        pool.depositToken = depositTokenAddress;
        pool.swapRouteForDepositToken = newSwapRoute;
        emit UpdateSwapRouteForDepositToken(
            poolAddress,
            pool.swapRouteForDepositToken
        );
    }

    function updateSwapRouteForExitToken(
        address poolAddress,
        bytes32 newSwapRoute
    ) external onlyAdmin isAdded(poolAddress) {
        Pool storage pool = poolInfo[poolAddress];
        pool.swapRouteForExitToken = newSwapRoute;
        emit UpdateSwapRouteForExitToken(
            poolAddress,
            pool.swapRouteForExitToken
        );
    }

    function updateExitTokenSettings(
        address poolAddress,
        address exitTokenAddress,
        bytes32 newSwapRoute,
        uint256 exitIndex
    ) external onlyAdmin isAdded(poolAddress) {
        Pool storage pool = poolInfo[poolAddress];
        if (exitIndex >= pool.tokens.length) {
            revert InvalidIndex("YO: Invalid index");
        }
        if (exitTokenAddress == address(0)) {
            revert ZeroAddress("YO: Zero Address");
        }
        pool.exitToken = exitTokenAddress;
        pool.exitTokenIndex = exitIndex;
        pool.swapRouteForExitToken = newSwapRoute;
        emit UpdateSwapRouteForExitToken(
            poolAddress,
            pool.swapRouteForExitToken
        );
    }

    function updatePoolSwapRoutes(
        address poolAddress,
        bytes32[] memory newSwapRoutes
    ) external onlyAdmin isAdded(poolAddress) {
        Pool storage pool = poolInfo[poolAddress];
        if (newSwapRoutes.length != pool.tokens.length) {
            revert InvalidArrayLengths("YO: Invalid array lengths");
        }
        pool.swapRoutes = newSwapRoutes;
        emit UpdatePoolSwapRoutes(poolAddress, pool.swapRoutes);
    }

    function turnOffPool(address poolAddress)
        external
        onlyAdmin
        isAdded(poolAddress)
    {
        Pool storage pool = poolInfo[poolAddress];
        if (pool.isActive == false) {
            revert AlreadyAssigned("YO: Value is already assigned");
        }
        pool.isActive = false;
        emit TurnOffPool(poolAddress, pool.isActive);
    }

    function turnOnPool(address poolAddress)
        external
        onlyAdmin
        isAdded(poolAddress)
    {
        Pool storage pool = poolInfo[poolAddress];
        if (pool.isActive == true) {
            revert AlreadyAssigned("YO: Value is already assigned");
        }
        pool.isActive = true;
        emit TurnOnPool(poolAddress, pool.isActive);
    }

    /** 
    @dev Function performs contract administrator updates. 
    Only the owner can call.
    @param newAdmin new admin wallet address.
    */
    function updateAdmin(address newAdmin) external onlyOwner {
        if (newAdmin == address(0)) {
            revert ZeroAddress("YO: Zero Address");
        }
        if (newAdmin == admin) {
            revert AlreadyAssigned("Value already assigned");
        }
        admin = newAdmin;
        emit UpdateAdmin(newAdmin);
    }

    //======================================================= Public Functions ========================================================

    /**
    @dev Public view function returns the balance of the USDT token on this contract.
    */
    function usdcBalance() public view returns (uint256) {
        return IERC20(usdcToken).balanceOf(address(this));
    }

    function poolIsAdded(address poolAddress)
        public
        view
        isAdded(poolAddress)
        returns (bool)
    {
        Pool storage pool = poolInfo[poolAddress];
        return poolAddress == pool.bptToken;
    }

    function getPoolSwapRoutes(address poolAddress)
        public
        view
        isAdded(poolAddress)
        returns (bytes32[] memory)
    {
        Pool storage pool = poolInfo[poolAddress];
        return pool.swapRoutes;
    }

    function getPoolWeights(address poolAddress)
        public
        view
        isAdded(poolAddress)
        returns (uint256[] memory)
    {
        Pool storage pool = poolInfo[poolAddress];
        return pool.tokensWeights;
    }

    function getPoolTokens(address poolAddress)
        public
        view
        isAdded(poolAddress)
        returns (address[] memory)
    {
        Pool storage pool = poolInfo[poolAddress];
        return pool.tokens;
    }

    //======================================================= Internal Functions ========================================================

    /**
    @dev Helper internal function for withdrawing allowed tokens from Treasury contract.
    @param token withdraw token address
    @param amount withdraw token amount.
    @param user user wallet address.
    @param userId user ID in CBI system.
    */
    function _withdraw(
        address token,
        uint256 amount,
        address user,
        string memory userId
    ) internal {
        if (amount == 0) {
            revert ZeroAmount("YO: ZeroAmount");
        }
        if (token == address(0)) {
            if (address(this).balance < amount) {
                revert NotEnoughTokens("YO: Not enough tokens");
            }
            (bool sent, ) = user.call{value: amount}("");
            if (!sent) {
                revert FailedSentEther("Failed to send Ether");
            }
        } else {
            uint256 balanceToken = IERC20(token).balanceOf(address(this));
            if (balanceToken < amount) {
                revert NotEnoughTokens("YO: Not enough tokens");
            }
            IERC20(token).safeTransfer(user, amount);
        }

        emit Withdraw(token, amount, user, userId);
    }

    function _investInOneToken(Pool memory pool, uint256 amount)
        internal
        returns (uint256[] memory)
    {
        uint256[] memory outAmounts = new uint256[](pool.tokens.length);
        if (pool.depositToken == usdcToken) {
            for (uint256 i = 0; i <= pool.tokens.length - 1; i++) {
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

            for (uint256 i = 0; i <= pool.tokens.length - 1; i++) {
                if (pool.tokens[i] == pool.depositToken) {
                    outAmounts[i] = depositTokenAmount;
                } else {
                    outAmounts[i] = 0;
                }
            }
        }
        return outAmounts;
    }

    function _investInAllTokens(Pool memory pool, uint256 amount)
        internal
        returns (uint256[] memory)
    {
        uint256[] memory outAmounts = new uint256[](pool.tokens.length);
        uint256[] memory giveAmounts = new uint256[](pool.tokens.length);

        if (pool.depositToken == usdcToken) {
            for (uint256 i = 0; i <= pool.tokens.length - 1; i++) {
                outAmounts[i] = (amount * pool.tokensWeights[i]) / 1e18;
            }
            for (uint256 i = 0; i <= pool.tokens.length - 1; i++) {
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

            for (uint256 i = 0; i <= pool.tokens.length - 1; i++) {
                outAmounts[i] =
                    (depositTokenAmount * pool.tokensWeights[i]) /
                    1e18;
            }

            for (uint256 i = 0; i <= pool.tokens.length - 1; i++) {
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

    function _withdrawFromPoolInOneToken(Pool memory pool, uint256 bptAmount)
        internal
        returns (uint256)
    {
        uint256[] memory outAmounts = new uint256[](pool.tokens.length);
        uint256 balanceBefore;
        uint256 balanceAfter;

        for (uint256 i = 0; i <= pool.tokens.length - 1; i++) {
            outAmounts[i] = 0;
        }
        balanceBefore = IERC20(pool.exitToken).balanceOf(address(this));
        _balancerExitInOneToken(
            pool.poolId,
            pool.tokens,
            outAmounts,
            bptAmount,
            pool.exitTokenIndex
        );
        balanceAfter = IERC20(pool.exitToken).balanceOf(address(this));
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

    function _withdrawFromPoolInAllTokens(Pool memory pool, uint256 bptAmount)
        internal
        returns (uint256)
    {
        uint256[] memory outAmounts = new uint256[](pool.tokens.length);
        uint256[] memory balancesBefore = new uint256[](pool.tokens.length);
        uint256[] memory balancesAfter = new uint256[](pool.tokens.length);

        for (uint256 i = 0; i <= pool.tokens.length - 1; i++) {
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
            for (uint256 i = 0; i <= pool.tokens.length - 1; i++) {
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
            for (uint256 i = 0; i <= pool.tokens.length - 1; i++) {
                if (pool.tokens[i] != pool.depositToken) {
                    exitTokenAmount += _balancerSwap(
                        pool.swapRoutes[i],
                        pool.tokens[i],
                        pool.depositToken,
                        exitBalances[i]
                    );
                } else {
                    exitTokenAmount += exitBalances[i];
                }
            }
            usdcExitAmount = _balancerSwap(
                pool.swapRouteForDepositToken,
                pool.depositToken,
                usdcToken,
                exitTokenAmount
            );
        }
        return usdcExitAmount;
    }

    function _calcBalance(
        uint256[] memory balancesBefore,
        uint256[] memory balancesAfter
    ) internal pure returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](balancesBefore.length);
        for (uint256 i; i <= balancesBefore.length - 1; i++) {
            balances[i] = balancesAfter[i] - balancesBefore[i];
        }
        return balances;
    }

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

    function _balancerSwap(
        bytes32 _poolId,
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) internal returns (uint256) {
        IVault.SingleSwap memory singleSwap = IVault.SingleSwap(
            _poolId,
            swapKind,
            _tokenIn,
            _tokenOut,
            _amountIn,
            ""
        );
        return IVault(vault).swap(singleSwap, funds, 1, block.timestamp);
    }

    function _checkBalances(address[] memory tokens)
        internal
        view
        returns (uint256[] memory)
    {
        uint256[] memory balances = new uint256[](tokens.length);
        for (uint256 i; i <= tokens.length - 1; i++) {
            balances[i] = IERC20(tokens[i]).balanceOf(address(this));
        }
        return balances;
    }
}
